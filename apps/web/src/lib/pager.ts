/** GitHub-first fix jobs and their fifteen-minute human escalation. */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/env";
import { getInstallationToken } from "@/lib/connections";
import { locateRepo } from "@/lib/github-refresh";
import { CLAIMED } from "@/lib/claims";
import { deliverToAll, matchesProject } from "@/lib/alerts/channels";
import { ignoredKeys } from "@/lib/ignores";
import { alertMuted } from "@/lib/mutes";

const FIFTEEN_MINUTES = 15 * 60_000;
const DAY = 24 * 60 * 60_000;
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export function pagerEnabled(): boolean {
  return process.env.SPOOKY_PAGER_GITHUB === "on";
}

export type PagerJob = { id: string; name: string; project: string | null; lastNote?: string | null; alertKey?: string };
export type PageResult = { ok: boolean; reason?: string };

/** Keep untrusted job text short and safe for workflow inputs. */
export function cleanPagerInput(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e\p{L}\p{N}]/gu, "").slice(0, 300);
}

function httpReason(status: number): string {
  if (status === 403) return "Spooky needs permission to start Actions in this repo (Actions: write on the Spooky GitHub app).";
  if (status === 404) return "No .github/workflows/spooky-fix.yml in this repo's default branch, or Spooky can't see the repo.";
  return `http ${status}`;
}

/** Dispatch through the connected installation. No token enters a result, event, or log. */
export async function pageGithub(userId: string, job: PagerJob, what: string): Promise<PageResult> {
  const db = getDb();
  let channel: typeof schema.alertChannels.$inferSelect | undefined;
  let repo = "";
  let result: PageResult = { ok: false, reason: "No GitHub responder for this project." };
  try {
    const channels = await db.select().from(schema.alertChannels).where(and(eq(schema.alertChannels.userId, userId), eq(schema.alertChannels.kind, "github"), eq(schema.alertChannels.enabled, true)));
    channel = channels.find((c) => c.project && matchesProject(c.project, job.project));
    if (!channel) return result;
    repo = decrypt(channel.encryptedTarget);
    if (!REPO.test(repo)) {
      result = { ok: false, reason: "Invalid GitHub repository." };
    } else {
      const found = await locateRepo(userId, repo);
      if (!found) {
        result = { ok: false, reason: "This repo is not connected to Spooky." };
      } else {
        const token = await getInstallationToken(found.connectionId);
        const [owner, name] = repo.split("/");
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "spooky-particles" };
        const options = { headers, redirect: "error" as const, signal: AbortSignal.timeout(8_000) };
        const details = await fetch(url, options);
        if (!details.ok) {
          result = { ok: false, reason: httpReason(details.status) };
        } else {
          const data = await details.json() as { default_branch?: unknown };
          if (typeof data.default_branch !== "string" || !data.default_branch) {
            result = { ok: false, reason: "GitHub did not return a default branch." };
          } else {
            const dispatched = await fetch(`${url}/actions/workflows/spooky-fix.yml/dispatches`, {
              ...options,
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ ref: data.default_branch, inputs: {
                project: cleanPagerInput(job.project ?? ""), check: cleanPagerInput(job.name),
                what: cleanPagerInput(what), link: cleanPagerInput(new URL("/app/jobs", appUrl()).toString()),
              } }),
            });
            result = dispatched.status === 204 ? { ok: true } : { ok: false, reason: httpReason(dispatched.status) };
            if (result.ok) {
              const at = new Date();
              await db.insert(schema.events).values({ userId, name: CLAIMED, properties: { project: job.project?.trim().toLowerCase(), apiKeyId: null, via: "github", ms: FIFTEEN_MINUTES }, createdAt: at });
              await db.insert(schema.events).values({ userId, name: "pager.paged", properties: { jobId: job.id, project: job.project, alertKey: job.alertKey ?? "", at: at.toISOString() }, createdAt: at });
            }
          }
        }
      }
    }
  } catch {
    result = { ok: false, reason: "GitHub request failed." };
  }
  if (channel) {
    await db.update(schema.alertChannels).set(result.ok ? { lastOkAt: new Date(), lastError: null } : { lastError: (result.reason ?? "failed").slice(0, 120) }).where(eq(schema.alertChannels.id, channel.id));
    await appendAudit({ actor: "system:pager", userId, action: "pager.github_dispatched", target: `checkin_job:${job.id}`, after: { repo, ok: result.ok, reason: result.reason ?? null } });
  }
  return result;
}

export type Paged = { jobId: string; userId: string; project: string | null; alertKey: string; at: string };
export type EscalationJob = { id: string; userId: string; name: string; project: string | null; status: string; lastNote: string | null };

/** Pure decision; the alerts unique key handles races in the sending pass. */
export function dueEscalations(paged: Paged[], escalatedJobIds: Set<string>, jobsById: Map<string, EscalationJob>, nowMs: number): Paged[] {
  return paged.filter((p) => nowMs - Date.parse(p.at) >= FIFTEEN_MINUTES &&
    !escalatedJobIds.has(p.jobId) && jobsById.get(p.jobId)?.status === "down");
}

export async function escalatePages(nowMs = Date.now()): Promise<number> {
  if (!pagerEnabled()) return 0;
  const db = getDb();
  const rows = await db.select().from(schema.events).where(and(inArray(schema.events.name, ["pager.paged", "pager.escalated"]), gte(schema.events.createdAt, new Date(nowMs - DAY))));
  const allPaged: Paged[] = rows.filter((r) => r.name === "pager.paged" && typeof r.properties.jobId === "string" && typeof r.userId === "string").map((r) => ({
    jobId: r.properties.jobId as string, userId: r.userId!, project: typeof r.properties.project === "string" ? r.properties.project : null,
    alertKey: String(r.properties.alertKey ?? ""), at: String(r.properties.at ?? r.createdAt.toISOString()),
  }));
  const paged = [...new Map(allPaged.sort((a, b) => a.at.localeCompare(b.at)).map((p) => [`${p.userId}:${p.jobId}`, p])).values()];
  if (!paged.length) return 0;
  const jobs = await db.select().from(schema.checkinJobs).where(inArray(schema.checkinJobs.id, [...new Set(paged.map((p) => p.jobId))]));
  const escalated = new Set(rows.filter((r) => r.name === "pager.escalated" && paged.some((p) => p.jobId === r.properties.jobId && p.at === r.properties.pagedAt)).map((r) => String(r.properties.jobId ?? "")));
  const due = dueEscalations(paged, escalated, new Map(jobs.map((j) => [j.id, j])), nowMs);
  let sent = 0;
  for (const p of due) {
    const job = jobs.find((j) => j.id === p.jobId && j.userId === p.userId);
    // Muted, or the owner cleared this episode's notice: nobody wants the second ping.
    if (!job || (await alertMuted(p.userId, job.project, "job_quiet")) || (await ignoredKeys(p.userId)).has(p.alertKey)) continue;
    const key = `pager_escalated:${p.jobId}:${p.at}`;
    const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, p.userId)).limit(1);
    const [row] = await db.insert(schema.alerts).values({ userId: p.userId, kind: "job_quiet", key, channel: "channels", to: person?.email ?? "", subject: `${job.name}: still broken after 15 min`, payload: { jobId: job.id, project: job.project, pagedAt: p.at } })
      .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] }).returning({ id: schema.alerts.id });
    if (!row) continue;
    await db.insert(schema.events).values({ userId: p.userId, name: "pager.escalated", properties: { jobId: p.jobId, pagedAt: p.at }, createdAt: new Date(nowMs) });
    const hhmm = new Date(p.at).toISOString().slice(11, 16);
    const results = await deliverToAll(p.userId, { subject: `${job.name}: still broken after 15 min`, text: `Spooky paged a GitHub job at ${hhmm} UTC. It hasn't fixed it yet. Your agent machines can take it now.${job.lastNote ? `\n${job.lastNote}` : ""}`, link: new URL("/app/jobs", appUrl()).toString(), priority: "high" }, job.project);
    const ok = results.some((r) => r.ok);
    await db.update(schema.alerts).set({ sentAt: ok ? new Date(nowMs) : null, error: ok ? null : "no channel", payload: { jobId: job.id, project: job.project, pagedAt: p.at, deliveries: results } }).where(eq(schema.alerts.id, row.id));
    sent += 1;
  }
  return sent;
}
