/**
 * Read-only tools the help model may call. Every tool is bound to the signed-in
 * user's id on the server; the model can name a project, never a user. Results
 * are trimmed to what an answer needs and scrubbed of anything secret: no keys,
 * tokens, check-in links, env values or build log tails reach the model.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { listJobs } from "@/lib/checkins";
import type { claimsFor } from "@/lib/claims";
import type { listConnectionsWithSync } from "@/lib/connections";
import type { incidentsFor } from "@/lib/incidents";
import type { projectPageFor, projectsFor } from "@/lib/projects";
import { jobIssue } from "@/lib/checkins";

type Out<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;

export type HelpData = {
  incidents: (userId: string, project?: string) => Promise<Out<typeof incidentsFor>>;
  jobs: (userId: string) => Promise<Out<typeof listJobs>>;
  claims: (userId: string) => Promise<Out<typeof claimsFor>>;
  projects: (userId: string) => Promise<Out<typeof projectsFor>>;
  projectPage: (userId: string, name: string) => Promise<Out<typeof projectPageFor>>;
  connections: (userId: string) => Promise<Out<typeof listConnectionsWithSync>>;
};

const empty = { type: "object" as const, properties: {}, required: [] as string[], additionalProperties: false };

export const HELP_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "whats_broken",
    description: "The signed-in person's current problems: failed deployments in the last 30 days with the build log line that names the cause, scheduled jobs that failed, went quiet or never checked in, and which agent already claimed which fix. Call this for any 'why is this red' or 'what is broken' question.",
    input_schema: empty,
    strict: true,
  },
  {
    name: "list_projects",
    description: "Every project the signed-in person has, with its host, production URL and latest deploy state and time.",
    input_schema: empty,
    strict: true,
  },
  {
    name: "project_status",
    description: "One project's recent deployments, domains and recent deploy failures. Use the project name exactly as list_projects shows it (GitHub owner/repo or Vercel project name).",
    input_schema: {
      type: "object",
      properties: { project: { type: "string", description: "Project name as list_projects shows it" } },
      required: ["project"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "list_jobs",
    description: "The signed-in person's scheduled jobs: status, last check-in, next due time, the failure note when a run failed, and whether Spooky can watch it yet.",
    input_schema: empty,
    strict: true,
  },
  {
    name: "list_connections",
    description: "What the signed-in person has connected (GitHub, Vercel and others), each with its status, the reason when it needs attention, and its last sync.",
    input_schema: empty,
    strict: true,
  },
];

export const HELP_TOOL_NAMES = HELP_TOOLS.map((t) => t.name);

const SECRET_FIELD = /token|secret|password|passphrase|api.?key|authorization|cookie|credential|ping.?url|^env(s|vars?)?$|^logtail$|^probe$|^hashed/i;
const SECRET_TEXT: RegExp[] = [
  /\bsp_[A-Za-z0-9_-]{6,}/g,
  /\b(?:sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|github_pat_|xox[abpr]-|vercel_|pk_live_|sk_live_|rk_live_)[A-Za-z0-9_-]{6,}/g,
  /https?:\/\/[^\s"')]*\/api\/ping\/[^\s"')]*/g,
];

/** Scrubs secret-looking strings from free text. Used on tool results and on the final answer. */
export function scrubText(text: string): string {
  return SECRET_TEXT.reduce((t, re) => t.replace(re, "[hidden]"), text);
}

/** Drops secret fields at any depth and scrubs secret-looking strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELD.test(k)) continue;
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Bounds what one tool result adds to the model's context. */
export const HELP_TOOL_RESULT_CHARS = 12_000;

export type HelpToolResult = { content: string; isError: boolean };

/** Runs one tool for `userId`. The model's input can name a project; it can never change whose data is read. */
export async function runHelpTool(name: string, input: unknown, userId: string, data: HelpData): Promise<HelpToolResult> {
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  let value: unknown;
  try {
    value = await readFor(name, args, userId, data);
  } catch {
    return { content: "Could not read that right now.", isError: true };
  }
  if (value === undefined) return { content: `Unknown tool ${name}.`, isError: true };
  const text = JSON.stringify(redact(value));
  return { content: text.length > HELP_TOOL_RESULT_CHARS ? `${text.slice(0, HELP_TOOL_RESULT_CHARS)} [cut]` : text, isError: false };
}

async function readFor(name: string, args: Record<string, unknown>, userId: string, data: HelpData): Promise<unknown> {
  switch (name) {
    case "whats_broken": {
      const [report, jobs, claims] = await Promise.all([data.incidents(userId), data.jobs(userId), data.claims(userId)]);
      return {
        checkedAt: report.checkedAt,
        claims: claims.map((c) => ({ project: c.project, agent: c.agent, until: c.until })),
        failedDeploys: report.incidents.flatMap((i) => i.kind === "deploy_failed"
          ? [{ project: i.project, environment: i.environment, host: i.host, state: i.state, at: i.at, cause: i.cause, commit: i.commit?.message ?? null }]
          : []),
        jobProblems: jobs.flatMap((job) => {
          const issue = jobIssue(job);
          return issue ? [{ name: job.name, project: job.project, issue, status: job.status, lastCheckIn: job.lastPingAt, nextDue: job.nextDueAt, note: job.lastNote }] : [];
        }),
      };
    }
    case "list_projects": {
      const report = await data.projects(userId);
      return {
        projects: report.projects.slice(0, 60).map((p) => {
          const production = p.deployments.find((d) => d.environment.toLowerCase() === "production");
          const latest = p.deployments[0];
          return {
            name: p.name,
            host: p.host ?? production?.provider ?? latest?.provider ?? null,
            productionUrl: production?.url ?? (p.kind === "host" ? p.url : null),
            lastDeployState: latest?.state ?? null,
            lastDeployAt: latest?.at ?? null,
          };
        }),
        total: report.projects.length,
      };
    }
    case "project_status": {
      const project = typeof args.project === "string" ? args.project.trim().slice(0, 120) : "";
      if (!project) return { error: "Name a project." };
      const [page, incidents] = await Promise.all([data.projectPage(userId, project), data.incidents(userId, project)]);
      if (!page) return { error: "No project by that name. Call list_projects for the names." };
      return {
        project: page.project.name,
        deployments: page.deployments.slice(0, 10),
        domains: page.domains,
        recentFailures: incidents.incidents.flatMap((i) => i.kind === "deploy_failed"
          ? [{ environment: i.environment, at: i.at, cause: i.cause, commit: i.commit?.message ?? null }]
          : []),
      };
    }
    case "list_jobs": {
      const jobs = await data.jobs(userId);
      return {
        jobs: jobs.slice(0, 60).map((job) => ({
          name: job.name, project: job.project, owner: job.owner, status: job.status,
          lastCheckIn: job.lastPingAt, nextDue: job.nextDueAt, lastResult: job.lastPingKind,
          note: job.lastPingKind === "fail" ? job.lastNote : null,
          schedule: job.schedule, timeZone: job.timeZone, periodMinutes: job.periodMinutes, graceMinutes: job.graceMinutes,
          watched: job.watched, watchNote: job.watchNote,
        })),
        total: jobs.length,
      };
    }
    case "list_connections": {
      const rows = await data.connections(userId);
      return {
        connections: rows.map((c) => ({
          provider: c.provider, account: c.display, status: c.status, reason: c.statusReason, lastSyncedAt: c.lastSyncedAt,
          sync: c.sync ? { phase: c.sync.phase, refreshing: c.sync.refreshing, error: c.sync.error } : null,
        })),
      };
    }
    default:
      return undefined;
  }
}
