/**
 * Confirm a fix against production. An agent that thinks it fixed something asks here; Spooky
 * re-reads the hosts and answers from what production shows, never from the agent's word.
 *
 * Verdicts:
 * - fixed: production was read in the last few minutes, nothing is building, nothing is broken.
 * - still_broken: a deploy for the project is failing now. The incidents are returned.
 * - waiting_on_run: deploys are healthy, but a job has not checked in OK since it broke. A job
 *   can only be seen fixed when it runs, so Spooky says when that is due.
 * - checking: the last read is too old or a deploy is still building. Ask again shortly.
 * - unknown_project: no deploys or jobs by that name, so a typo never reads as fixed.
 *
 * Each answer other than "checking" is kept as a "fix.confirmed" event, so Today can show which
 * fixes production confirmed. Nothing is written to any host.
 */
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Actor } from "./actor";
import { FIX_CONFIRMED, recordDeploys } from "./catches";
import { incidentsFor, matchesIncidentProject, type Incident } from "./incidents";
import { listJobs } from "./checkins";
import { startSync } from "./sync";

/** Production must have been read this recently for a "fixed" answer. */
export const FRESH_MS = 3 * 60_000;
const BUILDING_STATES = ["in_progress", "queued", "pending"];
const BUILD_WINDOW_MS = 60 * 60_000;
const KNOWN_WINDOW_MS = 180 * 86_400_000;
const KICK_MS = 60_000;
const lastKick = new Map<string, number>();

export type FixVerdict = "fixed" | "still_broken" | "waiting_on_run" | "checking" | "unknown_project";
export type FixCheck = {
  project: string;
  verdict: FixVerdict;
  message: string;
  readAt: string | null;
  retryAfterSeconds: number | null;
  open: Incident[];
  checkedAt: string;
};
type Building = { name: string; at: string | null };

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 90 ? `${s} seconds ago` : `${Math.round(s / 60)} minutes ago`;
};

/** Pure: the answer from what Spooky last read. */
export function fixVerdict(input: { project: string; known: boolean; incidents: Incident[]; building: Building[]; readAt: string | null; now: number }): Omit<FixCheck, "checkedAt"> {
  const { project, known, incidents, building, readAt, now } = input;
  const base = { project, readAt, open: incidents };
  if (!known && !incidents.length) {
    return { ...base, verdict: "unknown_project", retryAfterSeconds: null, message: `Spooky has no deploys or jobs for "${project}". Use the GitHub owner/repo or the Vercel project name.` };
  }
  if (readAt && now - Date.parse(readAt) > FRESH_MS) {
    return { ...base, verdict: "checking", retryAfterSeconds: 60, message: `Spooky last read production ${ago(now - Date.parse(readAt))} and is reading it again now. Ask again in about a minute.` };
  }
  if (building.length) {
    return { ...base, verdict: "checking", retryAfterSeconds: 60, message: `A deploy is still building (${building[0].name}). Ask again when it finishes.` };
  }
  const deploys = incidents.filter((i) => i.kind === "deploy_failed");
  if (deploys.length) {
    const first = deploys[0];
    const cause = first.kind === "deploy_failed" && first.cause ? `: ${first.cause}` : "";
    return { ...base, verdict: "still_broken", retryAfterSeconds: null, message: `Not fixed yet. Production still shows ${deploys.length === 1 ? "a failed deploy" : `${deploys.length} failed deploys`} for ${project}${cause}.` };
  }
  const jobs = incidents.filter((i) => i.kind === "job");
  if (jobs.length) {
    const j = jobs[0];
    const due = j.kind === "job" && j.nextDue ? ` Next run is due ${new Date(j.nextDue).toISOString()}.` : "";
    return { ...base, verdict: "waiting_on_run", retryAfterSeconds: null, message: `Deploys look healthy. ${j.kind === "job" ? j.name : "A job"} has not checked in OK since it broke, so Spooky marks it fixed when it next runs.${due}` };
  }
  const read = readAt ? ` Spooky read production ${ago(now - Date.parse(readAt))}.` : "";
  return { ...base, verdict: "fixed", retryAfterSeconds: null, message: `Fixed. Nothing is broken for ${project}.${read}` };
}

export async function confirmFix(actor: Actor, project: string, nowMs = Date.now()): Promise<FixCheck> {
  const name = project.trim().toLowerCase().slice(0, 120);
  const db = getDb();
  const hosts = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, actor.userId), eq(schema.connections.provider, "vercel"), eq(schema.connections.status, "active")));

  // A stale read gets a fresh one now, past the usual 5 minute wait, at most once a minute.
  for (const c of hosts) {
    const read = c.lastSyncedAt?.getTime() ?? 0;
    if (nowMs - read <= FRESH_MS || nowMs - (lastKick.get(c.id) ?? 0) < KICK_MS) continue;
    lastKick.set(c.id, nowMs);
    try {
      await startSync(c, "system:watch");
    } catch {
      // Already running is the usual reason; the next ask sees its result.
    }
  }
  const reads = hosts.map((c) => c.lastSyncedAt?.getTime() ?? 0);
  const readAt = reads.length ? new Date(Math.min(...reads)).toISOString() : null;

  const [report, deployRows, jobs] = await Promise.all([
    incidentsFor(actor.userId, name),
    db.select({ name: schema.nodes.name, status: schema.nodes.status, at: schema.nodes.lastActivityAt }).from(schema.nodes).where(
      and(eq(schema.nodes.userId, actor.userId), eq(schema.nodes.kind, "deployment"), gte(schema.nodes.lastActivityAt, new Date(nowMs - KNOWN_WINDOW_MS))),
    ),
    listJobs(actor.userId),
  ]);
  await recordDeploys(actor.userId, nowMs);
  const mine = deployRows.filter((d) => matchesIncidentProject(d.name.replace(/\s+\(.*\)$/, ""), name));
  const building = mine
    .filter((d) => BUILDING_STATES.includes(d.status ?? "") && (d.at?.getTime() ?? 0) >= nowMs - BUILD_WINDOW_MS)
    .map((d) => ({ name: d.name, at: d.at?.toISOString() ?? null }));
  const known = mine.length > 0 || jobs.some((j) => matchesIncidentProject(j.project, name));
  const answer = fixVerdict({ project: name, known, incidents: report.incidents, building, readAt: readAt && Date.parse(readAt) > 0 ? readAt : null, now: nowMs });

  if (answer.verdict !== "checking" && answer.verdict !== "unknown_project") {
    try {
      await db.insert(schema.events).values({ userId: actor.userId, name: FIX_CONFIRMED, properties: { project: name, verdict: answer.verdict, open: answer.open.length, readAt: answer.readAt, apiKeyId: actor.apiKeyId ?? null } });
    } catch (err) {
      console.warn("fix confirmation not recorded", err instanceof Error ? err.message : err);
    }
  }
  return { ...answer, checkedAt: new Date(nowMs).toISOString() };
}

/** Plain text for a terminal or a hook. */
export function formatFixCheckText(c: FixCheck): string {
  const lines = [`Spooky fix check for ${c.project}: ${c.verdict.replace(/_/g, " ")}`, c.message];
  for (const i of c.open.slice(0, 5)) {
    lines.push(i.kind === "deploy_failed" ? `- deploy failed (${i.environment ?? "?"}) at ${i.at ?? "?"}${i.cause ? `: ${i.cause}` : ""}` : `- job ${i.name}: ${i.issue.replace(/_/g, " ")}`);
  }
  return lines.join("\n") + "\n";
}
