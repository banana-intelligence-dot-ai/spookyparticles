/**
 * The public fix feed on the homepage: fixes agents made, anonymized. Each row is only a time, a
 * kind of break and how long the fix took: never a project, repo, person, error text or commit.
 * On by default for accounts created on or after the privacy policy that says so (section 6);
 * accounts from before it stay off until the owner turns it on, as section 14 promises. Anyone can
 * turn it off. The choice is kept as events (latest wins) and every change is audited.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "./audit";
import type { Catch, CatchKind } from "./catches";
import { medianFixMinutes, provenAgentFix } from "./fix-stats";

export const FEED_ON = "public_feed.on";
export const FEED_OFF = "public_feed.off";
const MAX_ROWS = 50;
const MAX_ACCOUNTS = 200;
export const FEED_WINDOW_DAYS = 30;
/** Midnight Pacific on the day the policy line took effect. Accounts created from here on start on. */
export const DEFAULT_ON_FROM = new Date("2026-11-15T08:00:00Z");

/** Whether an account with no choice of its own is in the feed. */
export function onByDefault(createdAt: Date): boolean {
  return createdAt.getTime() >= DEFAULT_ON_FROM.getTime();
}

/** Plain words per kind. Nothing from the host or the project goes in. */
const WHAT: Record<CatchKind, string> = {
  deploy: "Production deploy failed",
  job: "Scheduled job went quiet",
  site: "Site stopped answering",
  server_errors: "Site threw server errors",
  check: "Project check failed",
};

export type PublicFix = { at: string; what: string; minutes: number };
export type PublicFeed = {
  fixed: number;
  medianMinutes: number | null;
  windowDays: number;
  fixes: PublicFix[];
  checkedAt: string;
};

/** One account's catches, reduced to anonymous rows: fixed by a code change an agent was on, with both times known. */
export function publicFixes(catches: Catch[]): PublicFix[] {
  return catches
    .filter((c) => c.status === "fixed" && c.fixedAt && provenAgentFix(c))
    .map((c) => {
      const fixedMs = Date.parse(c.fixedAt as string);
      const at = new Date(Math.floor(fixedMs / 60_000) * 60_000).toISOString();
      return { at, what: WHAT[c.kind], minutes: Math.max(1, Math.round((fixedMs - Date.parse(c.caughtAt)) / 60_000)) };
    })
    .filter((f) => Number.isFinite(f.minutes) && f.minutes > 0);
}

/** Merge every account's rows, newest first. Totals count every row; the list keeps the newest 50. */
export function buildFeed(lists: PublicFix[][], now: Date): PublicFeed {
  const all = lists.flat().sort((a, b) => b.at.localeCompare(a.at));
  const median = medianFixMinutes(all.map((f) => ({ fixedAt: f.at, caughtAt: new Date(Date.parse(f.at) - f.minutes * 60_000).toISOString() })));
  return {
    fixed: all.length,
    medianMinutes: median === null ? null : Math.round(median),
    windowDays: FEED_WINDOW_DAYS,
    fixes: all.slice(0, MAX_ROWS),
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

/** The whole feed. Reads each opted-in account the same way its Today page does. */
export async function publicFeed(): Promise<PublicFeed> {
  const { catchesFor } = await import("./catches");
  const [all, rows] = await Promise.all([accounts(), choices()]);
  const users = inFeed(all, rows).slice(0, MAX_ACCOUNTS);
  const lists = await Promise.all(
    users.map((u) =>
      catchesFor(u)
        .then((c) => publicFixes(c.catches))
        .catch((err) => {
          console.error("[public-feed] skipped an account", (err as Error).message);
          return [] as PublicFix[];
        }),
    ),
  );
  return buildFeed(lists, new Date());
}
