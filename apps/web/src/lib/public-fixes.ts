/**
 * The public fix feed on the homepage: breaks fixed after Spooky alerted someone, anonymized. Each row is only a time, a
 * kind of break and how long the fix took: never a project, repo, person, error text or commit.
 * On by default for accounts created on or after the privacy policy that says so (section 6);
 * accounts from before it stay off until the owner turns it on, as section 14 promises. Anyone can
 * turn it off. The choice is kept as events (latest wins) and every change is audited.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import type { Catch, CatchKind } from "./catches";
import { fixedAfterAlert, medianFixMinutes } from "./fix-stats";

export const FEED_ON = "public_feed.on";
export const FEED_OFF = "public_feed.off";
export const PUBLIC_FIX = "public_feed.fix";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
/** Accounts recomputed live per uncached first-page request; stored rows cover everyone. */
const MAX_LIVE_ACCOUNTS = 200;
/** Midnight Pacific on the day the policy line took effect. Accounts created from here on start on. */
export const DEFAULT_ON_FROM = new Date("2026-11-15T08:00:00Z");

/** Whether an account with no choice of its own is in the feed. */
export function onByDefault(createdAt: Date): boolean {
  return createdAt.getTime() >= DEFAULT_ON_FROM.getTime();
}

/** Plain words per kind. Nothing from the host or the project goes in. */
const WHAT: Record<CatchKind, string> = {
  deploy: "Deploy failed",
  job: "Scheduled job went quiet",
  site: "Site stopped answering",
  server_errors: "Site threw server errors",
  check: "Project check failed",
};

/** One anonymous row: when the fix landed, the kind of break, and how many minutes it took. */
export type PublicFix = { at: string; what: string; minutes: number };
export type PublicFeed = {
  fixed: number;
  medianMinutes: number | null;
  since: string | null;
  fixes: PublicFix[];
  more: boolean;
  checkedAt: string;
};
export type AccountFix = { userId: string; fix: PublicFix };

/** One account's catches, reduced to anonymous rows: fixed after an alert, with both times known. */
export function publicFixes(catches: Catch[]): PublicFix[] {
  return catches
    .filter((c) => c.status === "fixed" && c.fixedAt && fixedAfterAlert(c))
    .map((c) => {
      const fixedMs = Date.parse(c.fixedAt as string);
      const at = new Date(Math.floor(fixedMs / 60_000) * 60_000).toISOString();
      return { at, what: WHAT[c.kind], minutes: Math.max(1, Math.round((fixedMs - Date.parse(c.caughtAt)) / 60_000)) };
    })
    .filter((f) => Number.isFinite(f.minutes) && f.minutes > 0)
    // One commit that fixes two projects from the same repo is one fix to a reader.
    .filter((f, i, all) => all.findIndex((g) => g.at === f.at && g.what === f.what && g.minutes === f.minutes) === i);
}

const fixKey = (fix: PublicFix) => `${fix.at}|${fix.what}|${fix.minutes}`;

/** Keep only current feed accounts, and dedupe stored and fresh rows within each account. */
export function mergeStored(users: string[], stored: AccountFix[], fresh: AccountFix[]): PublicFix[][] {
  const allowed = new Set(users);
  const rows = new Map(users.map((userId) => [userId, new Map<string, PublicFix>()]));
  for (const { userId, fix } of [...stored, ...fresh]) {
    if (allowed.has(userId)) rows.get(userId)?.set(fixKey(fix), fix);
  }
  return users.map((userId) => [...(rows.get(userId)?.values() ?? [])]);
}

/** Merge every account's rows, newest first. Totals and median always use the full history. */
export function buildFeed(lists: PublicFix[][], now: Date, opts: { before?: string; limit?: number } = {}): PublicFeed {
  const all = lists.flat().sort((a, b) => b.at.localeCompare(a.at));
  const median = medianFixMinutes(all.map((f) => ({ fixedAt: f.at, caughtAt: new Date(Date.parse(f.at) - f.minutes * 60_000).toISOString() })));
  const beforeMs = opts.before === undefined ? null : Date.parse(opts.before);
  const eligible = beforeMs !== null && Number.isFinite(beforeMs) ? all.filter((fix) => Date.parse(fix.at) < beforeMs) : all;
  const requested = opts.limit ?? DEFAULT_LIMIT;
  const limit = Number.isFinite(requested) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested))) : DEFAULT_LIMIT;
  return {
    fixed: all.length,
    medianMinutes: median === null ? null : Math.round(median),
    since: all.at(-1)?.at ?? null,
    fixes: eligible.slice(0, limit),
    more: eligible.length > limit,
    checkedAt: now.toISOString(),
  };
}

/** Each account's latest choice. Rows must be oldest first. */
function latestChoices(rows: { userId: string | null; name: string }[]): Map<string, boolean> {
  const latest = new Map<string, boolean>();
  for (const r of rows) if (r.userId) latest.set(r.userId, r.name === FEED_ON);
  return latest;
}

/** Accounts in the feed: their own latest choice, else the default for when they joined. */
export function inFeed(users: { id: string; createdAt: Date }[], rows: { userId: string | null; name: string }[]): string[] {
  const latest = latestChoices(rows);
  return users.filter((u) => latest.get(u.id) ?? onByDefault(u.createdAt)).map((u) => u.id);
}

async function choices() {
  return getDb()
    .select({ userId: schema.events.userId, name: schema.events.name })
    .from(schema.events)
    .where(inArray(schema.events.name, [FEED_ON, FEED_OFF]))
    .orderBy(asc(schema.events.createdAt));
}

async function accounts(userId?: string) {
  const q = getDb().select({ id: schema.user.id, createdAt: schema.user.createdAt }).from(schema.user);
  return userId ? q.where(eq(schema.user.id, userId)) : q.orderBy(asc(schema.user.createdAt));
}

export async function publicFeedEnabled(userId: string): Promise<boolean> {
  const [users, rows] = await Promise.all([accounts(userId), choices()]);
  return inFeed(users, rows).includes(userId);
}

export async function setPublicFeed(actor: { userId: string; label: string }, on: boolean): Promise<boolean> {
  const before = await publicFeedEnabled(actor.userId);
  if (before === on) return on;
  await getDb().insert(schema.events).values({ userId: actor.userId, name: on ? FEED_ON : FEED_OFF, properties: {} });
  await appendAudit({ actor: actor.label, userId: actor.userId, action: "public_feed.set", target: "public_feed", before: { on: before }, after: { on } });
  return on;
}

function storedFix(properties: Record<string, unknown>): PublicFix | null {
  const { at, what, minutes } = properties;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || typeof what !== "string" || typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  return { at, what, minutes };
}

/** The whole feed. Reads each opted-in account the same way its Today page does. */
export async function publicFeed(opts: { before?: string; limit?: number } = {}): Promise<PublicFeed> {
  const { catchesFor } = await import("./catches");
  const [all, rows] = await Promise.all([accounts(), choices()]);
  const users = inFeed(all, rows);
  // Older pages read stored rows only: the first page already wrote down every recent fix.
  const live = opts.before ? [] : users.slice(0, MAX_LIVE_ACCOUNTS);
  const lists = await Promise.all(
    live.map((u) =>
      catchesFor(u)
        .then((c) => publicFixes(c.catches))
        .catch((err) => {
          console.error("[public-feed] skipped an account", (err as Error).message);
          return [] as PublicFix[];
      }),
    ),
  );
  const db = getDb();
  const storedRows = users.length
    ? await db
        .select({ id: schema.events.id, userId: schema.events.userId, properties: schema.events.properties })
        .from(schema.events)
        .where(and(eq(schema.events.name, PUBLIC_FIX), inArray(schema.events.userId, users)))
        .catch((err) => {
          console.error("[public-feed] could not read stored fixes", (err as Error).message);
          return [];
        })
    : [];
  const fresh = live.flatMap((userId, i) => lists[i].map((fix) => ({ userId, fix })));

  try {
    const known = new Map<string, Set<string>>();
    for (const row of storedRows) {
      if (!row.userId || typeof row.properties.key !== "string") continue;
      const keys = known.get(row.userId) ?? new Set<string>();
      keys.add(row.properties.key);
      known.set(row.userId, keys);
    }
    const additions = fresh
      .filter(({ userId, fix }) => !known.get(userId)?.has(fixKey(fix)))
      .map(({ userId, fix }) => ({ userId, name: PUBLIC_FIX, properties: { key: fixKey(fix), ...fix } }));
    if (additions.length) await db.insert(schema.events).values(additions);
  } catch (err) {
    console.error("[public-feed] could not store fixes", (err as Error).message);
  }

  const stored = storedRows.flatMap(({ userId, properties }): AccountFix[] => {
    const fix = storedFix(properties);
    return userId && fix ? [{ userId, fix }] : [];
  });
  return buildFeed(mergeStored(users, stored, fresh), new Date(), opts);
}
