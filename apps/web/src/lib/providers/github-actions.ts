/**
 * GitHub Actions, read-only: the latest run of each workflow on a repo's default branch,
 * and for a failed run the failing job, its failing step and the tail of that job's log.
 * Needs the GitHub App's "Actions: read" permission; without it the API answers 403 and
 * the caller records that the install has not approved it yet.
 *
 * Pure helpers live here so they can be tested; the fetching sits in the GitHub step.
 */
import { logTailAndCause } from "./vercel";

export type WorkflowRun = {
  id: number;
  name: string | null;
  path: string;
  head_branch: string | null;
  head_sha: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  run_started_at?: string | null;
  html_url: string;
  head_commit?: { message?: string | null } | null;
};

export type WorkflowJob = {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  html_url: string | null;
  steps?: { name: string; status: string | null; conclusion: string | null; number: number }[];
};

/** The newest run per workflow file on the default branch, newest first. Pushes and manual runs only. */
export function latestRunPerWorkflow(runs: WorkflowRun[], defaultBranch: string): WorkflowRun[] {
  const byPath = new Map<string, WorkflowRun>();
  for (const r of runs) {
    if (r.head_branch !== defaultBranch) continue;
    if (!["push", "workflow_dispatch", "schedule", "release", "repository_dispatch"].includes(r.event)) continue;
    const cur = byPath.get(r.path);
    if (!cur || r.created_at > cur.created_at) byPath.set(r.path, r);
  }
  return [...byPath.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Actions conclusions in the deployment vocabulary the rules read. In-progress runs are in_progress. */
export function stateOfRun(run: Pick<WorkflowRun, "status" | "conclusion">): string {
  if (run.status && run.status !== "completed") return run.status === "queued" ? "queued" : "in_progress";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    case "cancelled":
    case "skipped":
    case "neutral":
    case "stale":
      return "inactive";
    case "action_required":
      return "pending";
    default:
      return run.conclusion ?? "unknown";
  }
}

/** Workflows that put code somewhere, by name or path. Others are checks; both matter, this one labels. */
export function looksLikeDeploy(run: Pick<WorkflowRun, "name" | "path">): boolean {
  return /deploy|release|publish|ship|supabase|netlify|vercel|pages|functions|prod/i.test(`${run.name ?? ""} ${run.path}`);
}

/** The failing job and its first failed step, for the alert's one line. */
export function failingStep(jobs: WorkflowJob[]): { job: WorkflowJob; step: string | null } | null {
  const job = jobs.find((j) => j.conclusion === "failure" || j.conclusion === "timed_out") ?? jobs.find((j) => j.conclusion && j.conclusion !== "success" && j.conclusion !== "skipped") ?? null;
  if (!job) return null;
  const step = job.steps?.find((s) => s.conclusion === "failure" || s.conclusion === "timed_out")?.name ?? null;
  return { job, step };
}

/** Actions log lines start with an ISO timestamp; drop it, and the group and level markers, before scrubbing. */
export function cleanActionsLog(text: string): { text: string }[] {
  const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/;
  const GROUP = /^##\[(group|endgroup|section)\].*$/;
  const LEVEL = /^##\[(error|warning|notice)\]/;
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(TS, "").replace(GROUP, "").replace(LEVEL, ""))
    .filter((l) => l.trim().length > 0)
    .map((l) => ({ text: l }));
}

/** The last lines of a job log and the line that names the failure, from the raw log text (last 64 KB is enough). */
export function actionsTailAndCause(logText: string, step: string | null): { tail: string[]; cause: string | null } {
  const tailText = logText.length > 65_536 ? logText.slice(-65_536) : logText;
  const r = logTailAndCause(cleanActionsLog(tailText));
  return { tail: r.tail, cause: r.cause ?? (step ? `Step failed: ${step}` : null) };
}
