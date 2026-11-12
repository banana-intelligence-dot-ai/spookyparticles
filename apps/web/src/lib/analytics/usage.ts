/**
 * First-party, cookieless usage counting (no cookies, no third-party scripts).
 *
 * Two layers: Vercel Web Analytics counts page views, visitors, referrers and utm tags.
 * This module counts the actions that mean the product worked, server side, credited to
 * the link tag the person first arrived with (?ref=x-launch, ?ref=hn, utm_source and
 * utm_campaign). Nothing here sets a cookie or stores an IP, a user agent or an email.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Link tags: lowercase letters, digits and hyphens, 2 to 40 characters. */
export const REF_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function cleanRef(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return REF_RE.test(v) ? v : null;
}

export type Arrival = { ref: string | null; utmSource: string | null; utmCampaign: string | null; path: string | null };

export function cleanArrival(input: Record<string, unknown>): Arrival {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const path = str(input.path, 200);
  return {
    ref: cleanRef(typeof input.ref === "string" ? input.ref : null),
    utmSource: cleanRef(typeof input.utm_source === "string" ? input.utm_source : null),
    utmCampaign: cleanRef(typeof input.utm_campaign === "string" ? input.utm_campaign : null),
    path: path && path.startsWith("/") && !path.includes("?") ? path : null,
  };
}

/** Events the browser may report without a sign-in. Everything else is written by the server. */
export const CLIENT_EVENTS = new Set(["landed", "signin_clicked", "outbound_clicked", "signed_in", "setup_prompt_copied", "move_to_vercel_clicked"]);

/** The north-star funnel, in order, for the stats read. */
export const FUNNEL = ["landed", "signin_clicked", "signed_up", "consent_granted:github", "consent_granted:gmail", "consent_granted:vercel", "agent_key_created", "reading_complete", "alert_sent"] as const;

export async function recordUsage(input: { event: string; userId?: string | null; arrival?: Partial<Arrival>; props?: Record<string, string | number | boolean | null> }): Promise<void> {
  try {
    await getDb()
      .insert(schema.usageEvents)
      .values({
        event: input.event.slice(0, 64),
        userId: input.userId ?? null,
        ref: input.arrival?.ref ?? null,
        utmSource: input.arrival?.utmSource ?? null,
        utmCampaign: input.arrival?.utmCampaign ?? null,
        path: input.arrival?.path ?? null,
        props: input.props ?? {},
      });
  } catch (err) {
    // Counting must never break the thing being counted.
    console.warn("[usage] not recorded", input.event, (err as Error).message);
  }
}

/** Remember the first tag a person arrived with. Later arrivals never overwrite it. */
export async function rememberArrival(userId: string, a: Arrival): Promise<void> {
  if (!a.ref && !a.utmSource && !a.utmCampaign) return;
  try {
    await getDb()
      .insert(schema.userRefs)
      .values({ userId, ref: a.ref, utmSource: a.utmSource, utmCampaign: a.utmCampaign, landingPath: a.path })
      .onConflictDoNothing({ target: schema.userRefs.userId });
  } catch (err) {
    console.warn("[usage] arrival not remembered", (err as Error).message);
  }
}

export async function arrivalFor(userId: string): Promise<Arrival | null> {
  const [r] = await getDb().select().from(schema.userRefs).where(eq(schema.userRefs.userId, userId)).limit(1);
  return r ? { ref: r.ref, utmSource: r.utmSource, utmCampaign: r.utmCampaign, path: r.landingPath } : null;
}

export type StatsRow = { event: string; ref: string; count: number; people: number };

/**
 * Counts per event and tag over a window: the table to read after a launch. A server
 * event with no tag of its own is credited to the person's first tag. "direct" is no tag.
 */
export async function usageStats(days = 30): Promise<{ since: string; rows: StatsRow[]; funnel: { step: string; count: number; people: number }[]; moves: { move_to_vercel_clicked: number; moved_to_vercel: number } }> {
  const since = new Date(Date.now() - days * 86_400_000);
  const db = getDb();
  const rows = await db
    .select({
      event: schema.usageEvents.event,
      ref: sql<string>`coalesce(${schema.usageEvents.ref}, ${schema.userRefs.ref}, ${schema.usageEvents.utmCampaign}, ${schema.userRefs.utmCampaign}, 'direct')`,
      count: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${schema.usageEvents.userId})::int`,
    })
    .from(schema.usageEvents)
    .leftJoin(schema.userRefs, eq(schema.userRefs.userId, schema.usageEvents.userId))
    .where(gte(schema.usageEvents.createdAt, since))
    .groupBy(schema.usageEvents.event, sql`2`)
    .orderBy(desc(sql`3`));
  const totals = new Map<string, { count: number; people: number }>();
  for (const r of rows) {
    const t = totals.get(r.event) ?? { count: 0, people: 0 };
    t.count += Number(r.count);
    t.people += Number(r.people);
    totals.set(r.event, t);
  }
  return {
    since: since.toISOString(),
    rows: rows.map((r) => ({ event: r.event, ref: r.ref, count: Number(r.count), people: Number(r.people) })),
    funnel: FUNNEL.map((step) => ({ step, count: totals.get(step)?.count ?? 0, people: totals.get(step)?.people ?? 0 })),
    moves: { move_to_vercel_clicked: totals.get("move_to_vercel_clicked")?.count ?? 0, moved_to_vercel: totals.get("moved_to_vercel")?.count ?? 0 },
  };
}

/** Admins read site-wide counts. Set SP_ADMIN_EMAILS to a comma-separated list; empty means nobody. */
export async function isAdmin(userId: string): Promise<boolean> {
  const allowed = (process.env.SP_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return false;
  const [u] = await getDb().select({ email: schema.user.email }).from(schema.user).where(and(eq(schema.user.id, userId))).limit(1);
  return Boolean(u && allowed.includes(u.email.toLowerCase()));
}
