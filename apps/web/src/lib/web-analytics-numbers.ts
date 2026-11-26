/**
 * Daily visitors for every Vercel project with Web Analytics on, read with the Vercel access the
 * person already gave Spooky. Nothing to set up: a connected project with analytics on gets a row
 * in the morning message. Vercel counts whole UTC days, so the row says "UTC day".
 * Each read's outcome is kept on the project node (web_analytics_read), so a refusal is visible.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAccessToken } from "@/lib/connections";
import { countWebAnalytics, type VercelScope, type WebAnalyticsCounts } from "@/lib/providers/vercel";
import type { LatestNumber } from "@/lib/checkin-stats";
import { PRODUCT_CLICK_APP_NAMES } from "@/lib/x-posts/private-terms";

/**
 * Sites whose main number is product clicks rather than visitors. A stopgap until the main number
 * is a per-site setting with an API and MCP tool; set 2026-11-19 at the owner's request.
 */
const MAIN_IS_PRODUCT_CLICKS = new Set(PRODUCT_CLICK_APP_NAMES);

/** Pure: one site's row. A zero is a true number when the read worked. */
export function webAnalyticsRow(app: string, day: string, c: WebAnalyticsCounts): LatestNumber {
  return MAIN_IS_PRODUCT_CLICKS.has(app)
    ? { app, day, mainName: "product clicks", mainValue: c.clicks, week: null, counts: { visitors: c.visitors, "page views": c.pageviews }, utcDay: true }
    : { app, day, mainName: "visitors", mainValue: c.visitors, week: c.weekVisitors, counts: { "product clicks": c.clicks, "page views": c.pageviews }, utcDay: true };
}

/** At most this many projects a person, so one morning stays a few dozen GETs. */
const MAX_PROJECTS = 20;

export function utcDay(ms: number, offsetDays = 0): string {
  return new Date(ms + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Rows for the reads that worked, and how many reads the host refused (not network or parse failures). */
export async function webAnalyticsNumbers(userId: string, nowMs: number): Promise<{ rows: LatestNumber[]; refused: number }> {
  const db = getDb();
  const projects = await db
    .select({ id: schema.nodes.id, name: schema.nodes.name, externalKey: schema.nodes.externalKey, attributes: schema.nodes.attributes })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project"), sql`${schema.nodes.attributes}->>'provider' = 'vercel'`, sql`${schema.nodes.attributes}->>'web_analytics' = 'true'`))
    .limit(MAX_PROJECTS);
  const day = utcDay(nowMs, -1);
  const weekStart = utcDay(nowMs, -7);
  const rows: LatestNumber[] = [];
  let refused = 0;
  for (const p of projects) {
    const a = p.attributes as Record<string, unknown>;
    const connectionId = typeof a.connection_id === "string" ? a.connection_id : null;
    const scopeId = typeof a.scope_id === "string" ? a.scope_id : null;
    const projectId = p.externalKey?.startsWith("vercel:project:") ? p.externalKey.slice("vercel:project:".length) : null;
    if (!connectionId || !scopeId || !projectId) continue;
    const scope: VercelScope = { kind: a.scope_kind === "user" ? "user" : "team", id: scopeId, slug: typeof a.scope_slug === "string" ? a.scope_slug : "", name: "" };
    let result: Awaited<ReturnType<typeof countWebAnalytics>>;
    try {
      result = await countWebAnalytics(await getAccessToken(connectionId), scope, projectId, day, weekStart);
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
    await db
      .update(schema.nodes)
      .set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ web_analytics_read: { day, ok: result.ok, reason: result.ok ? null : result.reason, status: result.ok ? null : (result.status ?? null), at: new Date(nowMs).toISOString() } })}::jsonb` })
      .where(eq(schema.nodes.id, p.id));
    if (!result.ok) {
      if (result.reason === "not_readable") refused += 1;
      continue;
    }
    rows.push(webAnalyticsRow(p.name, day, result.counts));
  }
  return { rows, refused };
}
