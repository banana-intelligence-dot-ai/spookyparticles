/** The same current deployment and job incidents for REST and MCP readers. */
import { jobIssue, listJobs, type JobIssue } from "./checkins";
import { refreshRepoQuietly } from "./github-refresh";
import { failedDeployments } from "./projects";
import { resyncHostsQuietlyFor } from "./sync";
import type { Claim } from "./claims";

const WINDOW_MS = 30 * 86_400_000;

export type DeployIncident = {
  kind: "deploy_failed";
  /** This failure's identity; the owner can ignore it by this key. */
  key: string;
  project: string;
  environment: string | null;
  host: string | null;
  state: string | null;
  at: string | null;
  url: string | null;
  cause: string | null;
  logTail: string[];
  inspectorUrl: string | null;
  commit: { sha: string; ref: string | null; message: string | null } | null;
  source: string;
};

export type JobIncident = {
  kind: "job";
  name: string;
  project: string | null;
  status: string;
  issue: JobIssue;
  lastCheckIn: string | null;
  lastNote: string | null;
  nextDue: string | null;
  url: "/app/jobs";
};

export type Incident = DeployIncident | JobIncident;

export type IncidentsReport = {
  incidents: Incident[];
  checkedAt: string;
  repoRefreshed: boolean;
  note: string;
};

export function matchesIncidentProject(project: string | null, narrowedTo: string): boolean {
  const candidate = project?.trim().toLowerCase();
  const name = narrowedTo.trim().toLowerCase();
  if (!name) return true;
  if (!candidate) return false;
  return candidate === name || candidate.endsWith(`/${name}`) || candidate === name.split("/").pop();
}

export async function incidentsFor(userId: string, project = ""): Promise<IncidentsReport> {
  const name = project.trim().toLowerCase();
  const refreshed = name ? await refreshRepoQuietly(userId, name) : "skipped";
  await resyncHostsQuietlyFor(userId);
  const now = Date.now();
  const [deployments, jobs] = await Promise.all([failedDeployments(userId), listJobs(userId)]);
  const failed = deployments.filter((d) => d.at && now - Date.parse(d.at) <= WINDOW_MS);
  const deployIncidents = failed
    .map((d) => {
      const projectName = d.name.replace(/\s+\(.*\)$/, "");
      return {
        kind: "deploy_failed" as const,
        key: d.key,
        project: projectName,
        environment: d.environment || null,
        host: d.provider,
        state: d.state,
        at: d.at,
        url: d.url,
        cause: d.cause,
        logTail: d.logTail,
        inspectorUrl: d.inspectorUrl,
        commit: d.sha ? { sha: d.sha, ref: d.ref ?? null, message: d.message ?? null } : null,
        source: d.cause ? `${d.provider ?? "host"} build log` : d.provider === "Vercel" ? "Vercel deployments" : "GitHub deployments",
      } satisfies DeployIncident;
    })
    .filter((incident) => matchesIncidentProject(incident.project, name));
  const jobIncidents = jobs.flatMap((job): JobIncident[] => {
    const issue = jobIssue(job);
    if (!issue || !matchesIncidentProject(job.project, name)) return [];
    return [{
      kind: "job",
      name: job.name,
      project: job.project,
      status: job.status,
      issue,
      lastCheckIn: job.lastPingAt,
      lastNote: oneLine(job.lastNote) || null,
      nextDue: job.nextDueAt,
      url: "/app/jobs",
    }];
  });
  return {
    incidents: [...deployIncidents, ...jobIncidents],
    checkedAt: new Date(now).toISOString(),
    repoRefreshed: refreshed === "refreshed",
    note: name
      ? "The named repo was re-read from GitHub just now (at most once a minute); Vercel is re-read when its last read is over 5 minutes old."
      : "Hosts are re-read when this is called and the last read is over 5 minutes old; name a project to re-read its repo right now.",
  };
}

function oneLine(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\/api\/ping\/[A-Za-z0-9_-]+/gi, "/api/ping/[redacted]")
    .replace(/\bsp_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(origin: string, value: string | null | undefined): string {
  if (!value) return "No link was reported.";
  try {
    return oneLine(new URL(value, origin).toString());
  } catch {
    return oneLine(value);
  }
}

function jobProblem(issue: JobIssue): string {
  if (issue === "failed") return "failed";
  if (issue === "quiet") return "went quiet";
  return "never checked in";
}

const LOG_LINES = 8;

/** Who is on it: nothing when unclaimed, "you" for the asking key, else the other agent. */
function claimLine(claim: Claim | null, viewerKeyId: string | null): string | null {
  if (!claim) return null;
  if (viewerKeyId && claim.apiKeyId === viewerKeyId) return `Claimed: by you, until ${claim.until}.`;
  return `Claimed: by ${oneLine(claim.agent) || "another session"} at ${claim.at}, until ${claim.until}. Leave it to them unless your human says otherwise.`;
}

/** Renders an agent-ready inbox without reading state or including private check-in links. */
export function formatIncidentsText(
  report: Pick<IncidentsReport, "incidents">,
  project: string,
  origin: string,
  opts: { claims?: Claim[]; viewerKeyId?: string | null } = {},
): string {
  if (report.incidents.length === 0) return "";
  const safeProject = oneLine(project) || "your projects";
  const claims = opts.claims ?? [];
  const viewer = opts.viewerKeyId ?? null;
  const claimOf = (p: string | null) => {
    if (!p) return null;
    const name = p.toLowerCase();
    return claims.find((c) => matchesIncidentProject(name, c.project) || matchesIncidentProject(c.project, name)) ?? null;
  };
  let unclaimed = false;
  const blocks = report.incidents.map((incident) => {
    const claim = claimOf(incident.project);
    if (!claim) unclaimed = true;
    const claimed = claimLine(claim, viewer);
    if (incident.kind === "job") {
      const when = incident.issue === "never_checked_in"
        ? "never checked in"
        : `last check-in ${oneLine(incident.lastCheckIn) || "unknown"}; next due ${oneLine(incident.nextDue) || "unknown"}`;
      return [
        `Job ${jobProblem(incident.issue)}: ${oneLine(incident.name) || "Unnamed job"}${incident.project ? ` (${oneLine(incident.project)})` : ""}`,
        `When: ${when}`,
        `Last note: ${oneLine(incident.lastNote) || "No note was reported."}`,
        `Link: ${absoluteUrl(origin, incident.url)}`,
        ...(claimed ? [claimed] : []),
      ].join("\n");
    }
    const c = incident.commit;
    const tail = (incident.logTail ?? []).map(oneLine).filter(Boolean).slice(-LOG_LINES);
    return [
      `Deploy failed: ${oneLine(incident.project) || "Unknown project"}${incident.environment ? ` (${oneLine(incident.environment)}${incident.host ? ` on ${oneLine(incident.host)}` : ""})` : ""}`,
      `When: ${oneLine(incident.at) || "unknown"}`,
      ...(c ? [`Change: ${oneLine(c.sha).slice(0, 7)}${c.message ? ` ${oneLine(c.message).slice(0, 120)}` : ""}${c.ref ? ` (${oneLine(c.ref)})` : ""}. Start there: this commit is the one that failed.`] : []),
      `Build log: ${oneLine(incident.cause) || "No build log line was reported."}`,
      ...(tail.length ? ["Last log lines:", ...tail.map((l) => `  | ${l.slice(0, 240)}`)] : []),
      `Link: ${absoluteUrl(origin, incident.inspectorUrl ?? incident.url)}`,
      ...(claimed ? [claimed] : []),
    ].join("\n");
  });
  const confirm = new URL("/api/v1/incidents/confirm", origin);
  confirm.searchParams.set("project", oneLine(project) || "owner/repo");
  confirm.searchParams.set("format", "text");
  const claimUrl = new URL("/api/v1/incidents/claim", origin);
  claimUrl.searchParams.set("project", oneLine(project) || "owner/repo");
  claimUrl.searchParams.set("format", "text");
  const auth = `printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -fsS -X POST -H @-`;
  return [
    `Spooky Particles: ${report.incidents.length} open ${report.incidents.length === 1 ? "problem" : "problems"} for ${safeProject}`,
    "",
    blocks.join("\n\n"),
    "",
    ...(unclaimed ? ["Before you start, claim it so other sessions leave it to you:", `${auth} "${claimUrl.toString()}"`, ""] : []),
    `Fix the cause and deploy. Then ask Spooky to check production; it answers fixed, still broken, or checking:`,
    `${auth} "${confirm.toString()}"`,
    "",
  ].join("\n");
}
