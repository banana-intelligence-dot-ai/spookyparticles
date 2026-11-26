/**
 * Spooky's own jobs report to Spooky. A step inside the watcher (the X post, the onboarding check)
 * pings its check-in by name under the admin accounts (SP_ADMIN_EMAILS), so a down or late one
 * pages us like any customer's job and starts the fix job. Never throws; never logs a link.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recordPingById } from "@/lib/checkins";

export function adminEmails(): string[] {
  return (process.env.SP_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Ok or fail ping, with a short reason, to every non-retired check-in with this name on an admin account. */
export async function pingOwnCheckin(name: string, ok: boolean, note: string, nowMs: number): Promise<void> {
  const tag = `[own check-in "${name}"]`;
  try {
    const emails = adminEmails();
    if (emails.length === 0) { console.warn(tag, "not pinged: no admin emails set"); return; }
    const db = getDb();
    const users = await db.select({ id: schema.user.id }).from(schema.user).where(inArray(sql<string>`lower(${schema.user.email})`, emails));
    const jobs = users.length === 0 ? [] : await db.select({ id: schema.checkinJobs.id }).from(schema.checkinJobs)
      .where(and(inArray(schema.checkinJobs.userId, users.map((u) => u.id)), eq(schema.checkinJobs.name, name), ne(schema.checkinJobs.status, "retired")));
    if (jobs.length === 0) { console.warn(tag, "not pinged: no check-in by that name"); return; }
    for (const job of jobs) {
      const r = await recordPingById(job.id, ok ? "ok" : "fail", note.slice(0, 200), nowMs);
      if (!r.ok) console.warn(tag, "ping refused:", r.reason);
    }
  } catch (err) {
    console.warn(tag, "not pinged:", (err as Error).message.slice(0, 160));
  }
}
