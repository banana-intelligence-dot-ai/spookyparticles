/**
 * Once a day in the watcher: did every new sign-up reach a first check-in that pinged? The answer
 * goes to our own check-in, so a stuck sign-up pages us (and starts the fix job) with no model run
 * on quiet days. Counts only: no ids, emails or names leave the database.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails, pingOwnCheckin } from "@/lib/own-checkins";
import { pacificDay, pacificHour } from "@/lib/x-posts/plan";

export const ONBOARDING_CHECKIN_NAME = "Onboarding: new sign-ups reach a first check-in";
/** 11am Pacific: after the morning digest and the X post. */
export const ONBOARDING_HOUR_PT = 11;
const WINDOW_DAYS = 14;
/** A day to set up before we call it stuck. */
const SETTLE_DAYS = 1;

export type SignupRow = { keys: number; jobs: number; pinged: number };
export type OnboardingResult = { status: "not_due" | "already" | "checked"; ok?: boolean; note?: string };

/** Pure: ok when every new account has a check-in that pinged; otherwise where each one stopped. */
export function onboardingVerdict(rows: SignupRow[]): { ok: boolean; note: string } {
  const stuck = rows.filter((r) => r.pinged === 0);
  if (stuck.length === 0) return { ok: true, note: `${rows.length} new ${rows.length === 1 ? "account" : "accounts"}, all reached a first check-in` };
  const signedIn = stuck.filter((r) => r.keys === 0 && r.jobs === 0).length;
  const keyNoJob = stuck.filter((r) => r.keys > 0 && r.jobs === 0).length;
  const neverPinged = stuck.filter((r) => r.jobs > 0).length;
  const parts = [signedIn && `${signedIn} signed in only`, keyNoJob && `${keyNoJob} made a key but no job`, neverPinged && `${neverPinged} made a job that never pinged`].filter(Boolean);
  return { ok: false, note: `${stuck.length} of ${rows.length} new accounts stuck before a first check-in: ${parts.join(", ")}. Station: .claude/skills/onboarding` };
}

export async function runOnboardingCheck(nowMs: number): Promise<OnboardingResult> {
  if (pacificHour(nowMs) !== ONBOARDING_HOUR_PT) return { status: "not_due" };
  const db = getDb();
  const key = `onboarding:${pacificDay(nowMs)}`;
  const [claimed] = await db.insert(schema.systemHeartbeats).values({ name: key, lastRunAt: new Date(nowMs), lastOk: false, detail: "deciding" })
    .onConflictDoNothing({ target: schema.systemHeartbeats.name }).returning({ name: schema.systemHeartbeats.name });
  if (!claimed) return { status: "already" };
  const emails = adminEmails();
  const users = await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user)
    .where(and(gte(schema.user.createdAt, new Date(nowMs - WINDOW_DAYS * 86_400_000)), lt(schema.user.createdAt, new Date(nowMs - SETTLE_DAYS * 86_400_000))));
  const fresh = users.filter((u) => !emails.includes(u.email.toLowerCase()));
  const rows: SignupRow[] = [];
  for (const u of fresh) {
    const [k] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, u.id));
    const [j] = await db.select({ n: sql<number>`count(*)::int`, pinged: sql<number>`count(${schema.checkinJobs.lastPingAt})::int` }).from(schema.checkinJobs).where(eq(schema.checkinJobs.userId, u.id));
    rows.push({ keys: k?.n ?? 0, jobs: j?.n ?? 0, pinged: j?.pinged ?? 0 });
  }
  const v = onboardingVerdict(rows);
  await db.update(schema.systemHeartbeats).set({ lastOk: v.ok, detail: v.note.slice(0, 200) }).where(eq(schema.systemHeartbeats.name, key));
  await pingOwnCheckin(ONBOARDING_CHECKIN_NAME, v.ok, v.note, nowMs);
  return { status: "checked", ...v };
}
