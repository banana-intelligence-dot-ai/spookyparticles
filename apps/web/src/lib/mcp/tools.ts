import { jobIssue, listJobs } from "@/lib/checkins";
import { incidentsFor } from "@/lib/incidents";
import { projectPageFor, projectsFor } from "@/lib/projects";
import { resyncHostsQuietlyFor } from "@/lib/sync";
import type { Actor } from "@/lib/actor";
import { findingsReport, reportAttempt, takeNext } from "@/lib/checks/handoff-store";
import { expirationsFor } from "@/lib/expirations/store";
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

function tool(def: Omit<Tool, "annotations">): Tool {
  return { ...def, annotations: { readOnlyHint: true } };
}

/** Binds the read tools to the same user that the REST actor resolves. A key with the write scope also gets the two handoff tools. */
export function toolsFor(actor: Actor): ToolRegistry {
  const userId = actor.userId;
  const read: ToolRegistry = {
    list_expirations: tool({
      description: "List known Vercel runtime deprecations and domain registration expiries, soonest first, plus domains whose date is unknown.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => expirationsFor(userId),
    }),
    whats_broken: tool({
      description: "Check current failed deployments, failed scheduled runs, jobs that have gone quiet, and jobs that never checked in, with known causes.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => {
        const [report, jobs] = await Promise.all([incidentsFor(userId), listJobs(userId)]);
        return {
          checkedAt: report.checkedAt,
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
        const incidentReport = await incidentsFor(userId, repo);
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
        const incidents = await incidentsFor(userId, name);
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
  };
  if (!actor.scopes.includes("write")) return read;
  const write = (def: Omit<Tool, "annotations">): Tool => ({ ...def, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } });
  return {
    ...read,
    next_finding: write({
      description: "Take the next open finding from the project check, most serious first. One at a time. Follow its instructions: open a pull request and never merge it, or give your person the exact steps. Then call report_finding.",
      inputSchema: empty,
      validate: (input) => validate(input, [], []),
      run: async () => {
        try { return await takeNext(actor); }
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
  };
}
