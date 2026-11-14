import { listChannels } from "@/lib/alerts/channels";
import { createJobFromBody } from "@/lib/checkin-create";
import { jobIssue, listJobs, updateJob, type JobView } from "@/lib/checkins";
import { activityReport } from "@/lib/activity-report";
import { getConnection } from "@/lib/connections";
import { listConnectionsFor } from "@/lib/connections-read";
import { addTrackedExpiration } from "@/lib/expirations/add";
import { setFindingStatus } from "@/lib/findings-status";
import { ignoreInput, setIgnored } from "@/lib/ignores";
import { runHistoryFor } from "@/lib/run-history";
import { startSync } from "@/lib/sync";
import { recordInboxRead } from "@/lib/agent-listening";
import { recordDeploys } from "@/lib/catches";
import { claimBreak, claimsFor } from "@/lib/claims";
import { confirmFix } from "@/lib/confirm-fix";
import { incidentsFor } from "@/lib/incidents";
import { projectPageFor, projectsFor } from "@/lib/projects";
import { resyncHostsQuietlyFor } from "@/lib/sync";
import type { Actor } from "@/lib/actor";
import { findingsReport, reportAttempt, takeNext } from "@/lib/checks/handoff-store";
import { expirationsFor } from "@/lib/expirations/store";
import { helpFor } from "@/lib/help/ask";
import { HELP_MAX_CHARS } from "@/lib/help/input";
import { ApiError } from "@/lib/http";
import { listServices, recordService } from "@/lib/services/store";
import { ToolError, type Tool, type ToolRegistry } from "./protocol";

const empty = { type: "object" as const, properties: {}, additionalProperties: false as const };
const named = (key: string, description: string, pattern?: string) => ({
  type: "object" as const,
  properties: { [key]: { type: "string", minLength: 1, maxLength: 120, description, ...(pattern ? { pattern } : {}) } },
  required: [key],
  additionalProperties: false as const,
});

function validate(input: Record<string, unknown>, required: string[], allowed: string[]): string | null {
  if (Object.keys(input).some((key) => !allowed.includes(key))) return "Unexpected tool argument";
  if (required.some((key) => typeof input[key] !== "string" || !(input[key] as string).trim())) return "Missing required tool argument";
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSchema = (key: string, description: string) => ({
  type: "object" as const,
  properties: { [key]: { type: "string", minLength: 36, maxLength: 36, description } },
  required: [key],
  additionalProperties: false as const,
});
const idInput = (key: string, label: string) => (input: Record<string, unknown>) =>
  validate(input, [key], [key]) ?? (UUID.test(input[key] as string) ? null : `${key} must be a ${label} ID`);

/** A job as the web app shows it, without the check-in link: that link is a credential the owner fetches in the web app. */
function jobWithoutLink(job: JobView) {
  const { pingUrl: _link, ...rest } = job;
  void _link;
  return rest;
}

/** Delivery errors are short reasons, but a URL must never leave the server. */
function scrubUrls(text: string | null): string | null {
  return text === null ? null : text.replace(/https?:\/\/\S+/gi, "[link hidden]");
}

/** REST validation errors reach the agent as plain tool errors. */
async function viaApi<T extends object>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (err) { if (err instanceof ApiError) throw new ToolError(err.message); throw err; }
}

function tool(def: Omit<Tool, "annotations">): Tool {
  return { ...def, annotations: { readOnlyHint: true } };
}

/** Binds the read tools to the same user that the REST actor resolves. A key with the write scope also gets the two handoff tools. */
export function toolsFor(actor: Actor): ToolRegistry {
  const userId = actor.userId;
  /** An agent asking about its project is how Today knows that session hears about it. */
  const heard = (project: string) => Promise.all([actor.apiKeyId ? recordInboxRead(userId, actor.apiKeyId, project) : null, recordDeploys(userId)]);
  const read: ToolRegistry = {
    list_expirations: tool({
      description: "List every known expiry date, including Vercel runtimes, domains, tracked credentials and Spooky agent keys, soonest first, plus domains whose date is unknown.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => expirationsFor(userId),
    }),
    whats_broken: tool({
      description: "Check current failed deployments, failed scheduled runs, jobs that have gone quiet, and jobs that never checked in, with known causes. claims shows which agent is already fixing which project; leave those alone.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => {
        const [report, jobs, claims] = await Promise.all([incidentsFor(userId), listJobs(userId), claimsFor(userId)]);
        return {
          checkedAt: report.checkedAt,
          claims,
          failedDeploys: report.incidents.filter((incident) => incident.kind === "deploy_failed"),
          failedRuns: jobs.filter((job) => jobIssue(job) === "failed").map((job) => ({
            name: job.name, project: job.project, at: job.lastPingAt, cause: job.lastNote,
          })),
          quietJobs: jobs.filter((job) => jobIssue(job) === "quiet").map((job) => ({
            name: job.name, project: job.project, status: job.status, lastCheckIn: job.lastPingAt, nextDue: job.nextDueAt,
          })),
          neverCheckedInJobs: jobs.filter((job) => jobIssue(job) === "never_checked_in").map((job) => ({
            name: job.name, project: job.project, status: job.status, createdAt: job.createdAt,
          })),
        };
      },
    }),
    did_my_push_land: tool({
      description: "After pushing a repo, check its newest deployment in each environment and whether a commit SHA is live in production.",
      inputSchema: {
        type: "object", additionalProperties: false,
        properties: {
          repo: { type: "string", minLength: 3, maxLength: 120, pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", description: "GitHub owner/repo full name" },
          sha: { type: "string", minLength: 7, maxLength: 40, pattern: "^[a-fA-F0-9]+$", description: "Optional full or abbreviated commit SHA" },
        },
        required: ["repo"],
      },
      validate: (input) => {
        const basic = validate(input, ["repo"], ["repo", "sha"]);
        if (basic) return basic;
        if (typeof input.repo !== "string" || input.repo.length > 120 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo)) return "repo must be owner/repo";
        if (input.sha !== undefined && (typeof input.sha !== "string" || !/^[a-fA-F0-9]{7,40}$/.test(input.sha))) return "sha must be a 7 to 40 character commit hash";
        return null;
      },
      run: async (input) => {
        const repo = input.repo as string;
        const sha = input.sha as string | undefined;
        const [incidentReport] = await Promise.all([incidentsFor(userId, repo), heard(repo)]);
        const project = (await projectsFor(userId)).projects.find((p) => p.name.toLowerCase() === repo.toLowerCase() && p.kind === "repo");
        if (!project) throw new Error("Unknown repo");
        const latest = new Map<string, typeof project.deployments[number]>();
        for (const deploy of project.deployments) {
          const environment = deploy.environment.toLowerCase();
          const current = latest.get(environment);
          if (!current || (deploy.at ?? "") > (current.at ?? "")) latest.set(environment, deploy);
        }
        const deployments = [...latest.values()].map((d) => ({ environment: d.environment, host: d.provider, state: d.state, at: d.at, url: d.url, sha: d.sha ?? null, message: d.message ?? null }));
        const production = latest.get("production");
        const match = (a: string, b: string) => a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase());
        return {
          repo: project.name,
          repoRefreshed: incidentReport.repoRefreshed,
          deployments,
          ...(sha ? { sha, shaLive: Boolean(production?.state === "success" && production.sha && match(production.sha, sha)) } : {}),
        };
      },
    }),
    claim_break: tool({
      description: "Before you start fixing a project's break, claim it so other coding sessions leave it to you. Lasts 30 minutes; call again to renew. If another agent holds it, claimed is false and the message says who; leave it to them unless your person says otherwise.",
      inputSchema: named("project", "GitHub owner/repo or Vercel project name"),
      validate: (input) => validate(input, ["project"], ["project"]),
      run: async (input) => claimBreak(actor, input.project as string),
    }),
    confirm_fix: tool({
      description: "After you fix and deploy, ask Spooky to check production for the project. It re-reads the hosts and answers fixed, still_broken (with what is still failing), waiting_on_run (a job must run once), or checking (ask again after retryAfterSeconds). Only say a break is fixed after this answers fixed.",
      inputSchema: named("project", "GitHub owner/repo or Vercel project name"),
      validate: (input) => validate(input, ["project"], ["project"]),
      run: async (input) => confirmFix(actor, input.project as string),
    }),
    list_projects: tool({
      description: "List every known project with its host, production URL, and latest deployment state and time.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => {
        await resyncHostsQuietlyFor(userId);
        const report = await projectsFor(userId);
        return { projects: report.projects.map((p) => {
          const production = p.deployments.find((d) => d.environment.toLowerCase() === "production");
          const latest = p.deployments[0];
          return {
            name: p.name, host: p.host ?? production?.provider ?? latest?.provider ?? null,
            productionUrl: production?.url ?? (p.kind === "host" ? p.url : null),
            lastDeployState: latest?.state ?? null, lastDeployAt: latest?.at ?? null,
          };
        }) };
      },
    }),
    project_status: tool({
      description: "Inspect one project's deployments, domains, and recent deployment failures.",
      inputSchema: named("project", "Project name as shown by list_projects"),
      validate: (input) => {
        const basic = validate(input, ["project"], ["project"]);
        if (basic) return basic;
        return typeof input.project === "string" && input.project.length <= 120 ? null : "project must be at most 120 characters";
      },
      run: async (input) => {
        const name = (input.project as string).trim();
        const [incidents] = await Promise.all([incidentsFor(userId, name), heard(name)]);
        const page = await projectPageFor(userId, name);
        if (!page) throw new Error("Unknown project");
        return { project: page.project.name, deployments: page.deployments, domains: page.domains, recentFailures: incidents.incidents.filter((incident) => incident.kind === "deploy_failed") };
      },
    }),
    list_jobs: tool({
      description: "List scheduled jobs with their status, last check-in, and next due time.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => ({ jobs: (await listJobs(userId)).map((job) => ({
        name: job.name, project: job.project, owner: job.owner, status: job.status, lastCheckIn: job.lastPingAt,
        nextDue: job.nextDueAt, lastResult: job.lastPingKind, cause: job.lastPingKind === "fail" ? job.lastNote : null,
        schedule: job.schedule, timeZone: job.timeZone,
        probe: job.probe ? { url: job.probe.url, rules: job.probe.expect.length } : null,
      })) }),
    }),
    list_findings: tool({
      description: "List the project check for every Vercel project: what is open, what passed, what could not be checked, and what an agent already did.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => {
        const report = await findingsReport(userId);
        return { ready: report.ready, findings: report.projects.flatMap((p) => p.checks.map((c) => ({ id: c.id, project: p.name, check: c.check, state: c.state, reason: c.reason, title: c.title, severity: c.severity, dismissed: Boolean(c.dismissedAt), handoff: c.handoff }))) };
      },
    }),
    list_services: tool({
      description: "List outside services used by Vercel projects: category, projects, monthly cost with its source (Vercel billing, recorded by you, recorded by agent) or why it is unknown, whether each is in use or idle and on what basis, where two projects could share one service of the same kind, and the whole Vercel bill for the last 30 days per project and product, Vercel's own charges included. Read-only suggestions.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => listServices(userId),
    }),
    list_connections: tool({
      description: "List the accounts connected to Spooky (GitHub, Vercel, mail inboxes): provider, status, last sync and reading progress. No tokens. Connecting or revoking an account is done in the web app.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => ({ connections: await listConnectionsFor(userId) }),
    }),
    list_alert_channels: tool({
      description: "List where alerts go (ntfy, Slack, Teams, email): kind, a masked label, project filter, whether it is on and its last delivery result. Addresses and webhook URLs are never returned.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => ({ channels: (await listChannels(userId)).map((c) => ({ ...c, lastError: scrubUrls(c.lastError) })) }),
    }),
    job_history: tool({
      description: "Each scheduled job's last 14 days of check-ins (hourly counts) and every miss Spooky caught, with when it came back. No check-in links.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => runHistoryFor(userId),
    }),
    recent_activity: tool({
      description: "Notices and charges across every inbox and vendor, newest first, plus deployments whose latest state failed.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, description: "How many items, default 100" },
        since: { type: "string", maxLength: 40, description: "Optional ISO date: only items after it" },
      } },
      validate: (input) => {
        const basic = validate(input, [], ["limit", "since"]);
        if (basic) return basic;
        if (input.limit !== undefined && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200)) return "limit must be a whole number from 1 to 200";
        if (input.since !== undefined && (typeof input.since !== "string" || input.since.length > 40 || Number.isNaN(Date.parse(input.since)))) return "since must be an ISO date";
        return null;
      },
      run: async (input) => activityReport(userId, input.limit ?? 100, typeof input.since === "string" ? input.since : null),
    }),
    help: tool({
      description: "Ask the Spooky Particles help assistant a question about Spooky itself: what a status means, how to connect GitHub or Vercel, how agent sign-in and the fixer work, why something is red. It can read this person's projects, jobs and connections. Answers only about Spooky. Limited to 5 questions a minute and 30 a day.",
      inputSchema: {
        type: "object", additionalProperties: false,
        properties: { question: { type: "string", minLength: 1, maxLength: HELP_MAX_CHARS, description: "One plain question" } },
        required: ["question"],
      },
      validate: (input) => validate(input, ["question"], ["question"]),
      run: async (input) => {
        try { return await helpFor(userId, { messages: [{ role: "user", content: input.question as string }] }); }
        catch (err) { if (err instanceof ApiError) throw new ToolError(err.message); throw err; }
      },
    }),
  };
  if (!actor.scopes.includes("write")) return read;
  const write = (def: Omit<Tool, "annotations">): Tool => ({ ...def, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } });
  return {
    ...read,
    next_finding: write({
      description: "Take the next open finding from the project check, most serious first, or the one your person handed you by finding_id. One at a time. Follow its instructions: open a pull request and never merge it, or give your person the exact steps. Then call report_finding.",
      inputSchema: { type: "object", additionalProperties: false, properties: { finding_id: { type: "string", description: "Optional: the finding your person handed you" } } },
      validate: (input) => {
        const basic = validate(input, [], ["finding_id"]);
        if (basic) return basic;
        if (input.finding_id !== undefined && (typeof input.finding_id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.finding_id))) return "finding_id must be a finding ID";
        return null;
      },
      run: async (input) => {
        try { return await takeNext(actor, false, typeof input.finding_id === "string" ? input.finding_id : null); }
        catch (err) { if (err instanceof ApiError) throw new ToolError(err.message); throw err; }
      },
    }),
    report_finding: write({
      description: "Report what you did on the in-progress finding. This does not mark it fixed.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        finding_id: { type: "string", description: "Finding ID" },
        outcome: { type: "string", enum: ["pr_opened", "told_person", "could_not_fix", "not_a_problem"] },
        pr_url: { type: "string", description: "GitHub pull request URL when outcome is pr_opened" },
        note: { type: "string", maxLength: 500, description: "Short plain text note" },
      }, required: ["finding_id", "outcome"] },
      validate: (input) => {
        const basic = validate(input, ["finding_id", "outcome"], ["finding_id", "outcome", "pr_url", "note"]);
        if (basic) return basic;
        if (typeof input.finding_id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.finding_id)) return "finding_id must be a finding ID";
        if (!["pr_opened", "told_person", "could_not_fix", "not_a_problem"].includes(input.outcome as string)) return "Choose a valid outcome";
        if (input.pr_url !== undefined && typeof input.pr_url !== "string") return "pr_url must be text";
        if (input.note !== undefined && typeof input.note !== "string") return "note must be text";
        return null;
      },
      run: async (input) => {
        try { return await reportAttempt(actor, { findingId: input.finding_id as string, outcome: input.outcome as "pr_opened" | "told_person" | "could_not_fix" | "not_a_problem", prUrl: input.pr_url, note: input.note }); }
        catch (err) { if (err instanceof ApiError) throw new ToolError(err.message); throw err; }
      },
    }),
    record_service: write({
      description: "Record an outside service that a Vercel project uses. This writes to Spooky Particles only.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        project: { type: "string", minLength: 1, maxLength: 120, description: "Vercel scope/project or linked GitHub owner/repo" },
        service: { type: "string", minLength: 1, maxLength: 80, description: "Service name" },
        monthlyCostUsd: { type: "number", minimum: 0, maximum: 1000000, description: "Optional monthly cost in USD" },
        note: { type: "string", maxLength: 500, description: "Optional short note" },
      }, required: ["project", "service"] },
      validate: (input) => {
        const basic = validate(input, ["project", "service"], ["project", "service", "monthlyCostUsd", "note"]);
        if (basic) return basic;
        if (typeof input.project !== "string" || input.project.length > 120 || typeof input.service !== "string" || input.service.length > 80) return "Project or service name is too long";
        if (input.monthlyCostUsd !== undefined && typeof input.monthlyCostUsd !== "number") return "monthlyCostUsd must be a number";
        if (input.note !== undefined && typeof input.note !== "string") return "note must be text";
        return null;
      },
      run: async (input) => {
        try { return await recordService(actor, input); }
        catch (err) { if (err instanceof ApiError) throw new ToolError(err.message); throw err; }
      },
    }),
    create_job: write({
      description: "Add a scheduled job to watch. Give a name and either periodMinutes or a cron schedule with timeZone. Writes to Spooky only. The check-in line (the link the job calls) is not returned here: tell your person to copy it from the Jobs page in the web app.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        name: { type: "string", minLength: 2, maxLength: 80, description: "Job name" },
        periodMinutes: { type: "integer", minimum: 1, maximum: 44640, description: "How often it should check in, in minutes" },
        graceMinutes: { type: "integer", minimum: 0, maximum: 10080, description: "Optional extra minutes before it counts as late" },
        project: { type: "string", maxLength: 120, description: "Optional project name" },
        owner: { type: "string", maxLength: 80, description: "Optional owner" },
        schedule: { type: "string", maxLength: 120, description: "Optional cron schedule" },
        timeZone: { type: "string", maxLength: 60, description: "Optional IANA time zone for the schedule" },
        maxRunMinutes: { type: "integer", minimum: 1, maximum: 10080, description: "Optional longest a run may take" },
        minCount: { type: "integer", minimum: 0, maximum: 1000000000, description: "Optional smallest item count a good run reports" },
      }, required: ["name"] },
      validate: (input) => validate(input, ["name"], ["name", "periodMinutes", "graceMinutes", "project", "owner", "schedule", "timeZone", "maxRunMinutes", "minCount"]),
      run: async (input) => viaApi(async () => ({
        job: jobWithoutLink(await createJobFromBody(actor, input)),
        checkInLine: "Not shown over MCP. Ask your person to copy it from the Jobs page in the web app.",
      })),
    }),
    retire_job: write({
      description: "Retire a scheduled job so Spooky stops watching it. Nothing is deleted; restore_job brings it back.",
      inputSchema: idSchema("job_id", "Job ID from list_jobs"),
      validate: idInput("job_id", "job"),
      run: async (input) => viaApi(async () => {
        const job = await updateJob(userId, input.job_id as string, { retired: true }, actor.label);
        if (!job) throw new ApiError(404, "not_found", "No such job");
        return { job: jobWithoutLink(job) };
      }),
    }),
    restore_job: write({
      description: "Bring a retired scheduled job back under watch.",
      inputSchema: idSchema("job_id", "Job ID from list_jobs"),
      validate: idInput("job_id", "job"),
      run: async (input) => viaApi(async () => {
        const job = await updateJob(userId, input.job_id as string, { retired: false }, actor.label);
        if (!job) throw new ApiError(404, "not_found", "No such job");
        return { job: jobWithoutLink(job) };
      }),
    }),
    ignore_break: write({
      description: "Stop counting one failed deploy, for example a retired project. The ignore names that exact failure, so the next failure shows again. Writes to Spooky only; unignore_break undoes it.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        key: { type: "string", minLength: 1, maxLength: 200, description: "The break's key from the project's deployments" },
        project: { type: "string", maxLength: 120, description: "Project name" },
      }, required: ["key"] },
      validate: (input) => validate(input, ["key"], ["key", "project"]) ?? (input.project !== undefined && typeof input.project !== "string" ? "project must be text" : null),
      run: async (input) => viaApi(async () => { const { key, project } = ignoreInput(input); return setIgnored(actor, key, project, true); }),
    }),
    unignore_break: write({
      description: "Count an ignored failed deploy again.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        key: { type: "string", minLength: 1, maxLength: 200, description: "The break's key" },
        project: { type: "string", maxLength: 120, description: "Project name" },
      }, required: ["key"] },
      validate: (input) => validate(input, ["key"], ["key", "project"]) ?? (input.project !== undefined && typeof input.project !== "string" ? "project must be text" : null),
      run: async (input) => viaApi(async () => { const { key, project } = ignoreInput(input); return setIgnored(actor, key, project, false); }),
    }),
    set_suggestion_status: write({
      description: "Record your person's verdict on a suggestion: confirmed, dismissed (the wrong-answer button) or open again. Writes to Spooky only.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        finding_id: { type: "string", minLength: 36, maxLength: 36, description: "Suggestion ID" },
        status: { type: "string", enum: ["open", "confirmed", "dismissed"] },
      }, required: ["finding_id", "status"] },
      validate: (input) => {
        const basic = validate(input, ["finding_id", "status"], ["finding_id", "status"]);
        if (basic) return basic;
        if (!UUID.test(input.finding_id as string)) return "finding_id must be a suggestion ID";
        if (!["open", "confirmed", "dismissed"].includes(input.status as string)) return "status must be open, confirmed or dismissed";
        return null;
      },
      run: async (input) => viaApi(() => setFindingStatus(actor, input.finding_id as string, input.status)),
    }),
    add_expiration: write({
      description: "Track a date something expires (an API key, token or certificate). Send only its name and date, never the secret itself; values that look like secrets are refused. Writes to Spooky only.",
      inputSchema: { type: "object", additionalProperties: false, properties: {
        kind: { type: "string", enum: ["api_key", "token", "certificate", "other"] },
        name: { type: "string", minLength: 1, maxLength: 80, description: "A plain name, for example STRIPE_KEY_PROD" },
        expiresOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
        provider: { type: "string", maxLength: 40, description: "Optional provider name" },
        project: { type: "string", maxLength: 120, description: "Optional project name" },
      }, required: ["kind", "name", "expiresOn"] },
      validate: (input) => validate(input, ["kind", "name", "expiresOn"], ["kind", "name", "expiresOn", "provider", "project"]),
      run: async (input) => viaApi(async () => ({ expiration: await addTrackedExpiration(actor, input) })),
    }),
    sync_connection: write({
      description: "Start a re-read of one connected account. Returns at once; check list_connections for progress. Fails if a sync is already running or the connection is not active.",
      inputSchema: idSchema("connection_id", "Connection ID from list_connections"),
      validate: idInput("connection_id", "connection"),
      run: async (input) => viaApi(async () => {
        const c = await getConnection(input.connection_id as string, userId).catch(() => null);
        if (!c) throw new ApiError(404, "not_found", "Connection not found");
        const run = await startSync(c, actor.label);
        return { started: true, syncRunId: run.syncRunId };
      }),
    }),
  };
}
