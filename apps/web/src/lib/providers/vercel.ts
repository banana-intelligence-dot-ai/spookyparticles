/**
 * Vercel, read-only, through a token the user pastes.
 *
 * Vercel tokens cannot be made read-only: a token carries its creator's role on
 * the scope it was made for. So the read-only promise is kept here, in code:
 * this module sends GET requests, with two shapes of the same read-only request-history query in vercel-query.ts, and
 * every response is reduced to the fields the map needs before it leaves this
 * file. Project responses include environment variables with their values; they
 * arrive in memory with the rest of the JSON, `pickProject` copies names and types only,
 * and the raw body is never logged or stored.
 */

import { pickSchedules } from "@/lib/vercel-schedules";

export const VERCEL_API = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    /** Milliseconds to wait, from Retry-After or the rate-limit reset header, when the API asked for it. */
    public readonly retryAfterMs: number | null = null,
  ) {
    super(`vercel ${path} ${status}`);
  }
}

/** The token works but reads nothing we can list: no personal account and no team answered a project list. */
export class VercelNoReadableScope extends Error {
  constructor() {
    super("vercel token reads no scope");
  }
}

type Query = Record<string, string | number | undefined>;

/** The GET HTTP function. The only customer-token POST is in vercel-query.ts. */
export async function vercelGet<T>(token: string, path: string, query: Query = {}): Promise<T> {
  return (await (await vercelGetResponse(token, path, query, "application/json")).json()) as T;
}

async function vercelGetResponse(token: string, path: string, query: Query, accept: string): Promise<Response> {
  const url = new URL(path, VERCEL_API);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${token}`, accept } });
  if (res.status === 429 || res.status === 503) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const waitMs = retryAfter ? retryAfter * 1000 : reset ? Math.max(1000, reset * 1000 - Date.now()) : 60_000;
    throw new VercelApiError(res.status, url.pathname, waitMs);
  }
  if (!res.ok) throw new VercelApiError(res.status, url.pathname);
  return res;
}

/** A token's shape, checked before any request: Vercel's personal tokens start with vcp_ and are a single opaque word. */
export function looksLikeVercelToken(raw: string): boolean {
  const t = raw.trim();
  return /^[A-Za-z0-9_-]{20,200}$/.test(t);
}

const isDenied = (err: unknown) => err instanceof VercelApiError && (err.status === 401 || err.status === 403 || err.status === 404);

// ---------- Who the token is ----------

export type VercelScope = { kind: "user" | "team"; id: string; slug: string; name: string };
export type VercelIdentity = {
  /** The personal account, when the token may read it. Team- and project-scoped tokens cannot. */
  user: { id: string; username: string } | null;
  /** Teams the token may read. A full-account token lists every team; a team token lists none and reads with no teamId. */
  teams: { id: string; slug: string; name: string }[];
  /** True when the token is scoped to a team or project: requests go out with no teamId. */
  scoped: boolean;
  /** The scopes that answered a project list. Everything the inventory reads is one of these. */
  scopes: VercelScope[];
};

type RawUser = { user: { id: string; username: string; email?: string } };
type RawTeams = { teams: { id: string; slug: string; name: string }[]; pagination?: { next?: number | null } };

/** Every team a full-account token belongs to, following pagination.next. */
async function listTeams(token: string, maxPages = 10): Promise<VercelIdentity["teams"]> {
  const teams: VercelIdentity["teams"] = [];
  let until: number | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const t = await vercelGet<RawTeams>(token, "/v2/teams", { limit: 100, until });
    for (const x of t.teams) teams.push({ id: x.id, slug: x.slug, name: x.name });
    const next = t.pagination?.next ?? null;
    if (!next || t.teams.length === 0) break;
    until = next;
  }
  return teams;
}

/** A scope is readable when it answers a one-project list. Anything else is left out, so the inventory never 403s mid-run. */
async function readable(token: string, scope: VercelScope): Promise<boolean> {
  try {
    await vercelGet(token, "/v10/projects", { ...teamQuery(scope), limit: 1 });
    return true;
  } catch (err) {
    if (isDenied(err)) return false;
    throw err;
  }
}

/**
 * GET /v2/user and GET /v2/teams, then prove each scope by listing one project.
 * A scoped token answers 403 to the account calls; it is still a valid token,
 * proven by listing one project with no teamId, and reads that scope only.
 */
export async function identifyToken(token: string): Promise<VercelIdentity> {
  let user: VercelIdentity["user"] = null;
  let teams: VercelIdentity["teams"] = [];
  let scoped = false;
  try {
    const u = await vercelGet<RawUser>(token, "/v2/user");
    user = { id: u.user.id, username: u.user.username };
  } catch (err) {
    if (!isDenied(err)) throw err;
    scoped = true;
  }
  if (!scoped) {
    try {
      teams = await listTeams(token);
    } catch (err) {
      if (!isDenied(err)) throw err;
    }
  }
  const candidates = scoped ? [SCOPED] : scopesFor(user, teams);
  const scopes: VercelScope[] = [];
  for (const s of candidates) if (await readable(token, s)) scopes.push(s);
  // Nothing readable with a teamId: try the token's own scope with none, which is how team and project tokens read.
  if (!scopes.length && !scoped && (await readable(token, SCOPED))) {
    scoped = true;
    scopes.push(SCOPED);
  }
  if (!scopes.length) throw new VercelNoReadableScope();
  return { user, teams, scoped, scopes };
}

const SCOPED: VercelScope = { kind: "team", id: "scoped", slug: "scoped", name: "Scoped token" };

function scopesFor(user: VercelIdentity["user"], teams: VercelIdentity["teams"]): VercelScope[] {
  const out: VercelScope[] = [];
  if (user) out.push({ kind: "user", id: user.id, slug: user.username, name: user.username });
  for (const t of teams) out.push({ kind: "team", id: t.id, slug: t.slug, name: t.name });
  return out;
}

/** The scopes an identity reads, as proven at identify time. */
export function scopesOf(id: Pick<VercelIdentity, "scopes">): VercelScope[] {
  return id.scopes;
}

/** What goes in the teamId query for a scope. A personal scope and a scoped token send none. */
export function teamQuery(scope: VercelScope): Query {
  return scope.kind === "team" && scope.id !== "scoped" ? { teamId: scope.id } : {};
}

// ---------- Projects ----------

/** The fields the map keeps from a project. Nothing else is copied out of the response. */
export type VercelProject = {
  id: string;
  name: string;
  accountId: string;
  framework: string | null;
  nodeVersion: string | null;
  live: boolean;
  paused: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** The linked Git repository, when the project deploys from one. repoId is the provider's stable id. */
  repo: { type: string; org: string; repo: string; repoId: string | null; productionBranch: string | null } | null;
  /** The current production deployment, from targets.production. */
  production: VercelDeployment | null;
  /** The newest deployment of any target, from latestDeployments. */
  latest: VercelDeployment | null;
  schedules?: import("@/lib/vercel-schedules").Schedule[];
  cronDeploymentId?: string | null;
  protection?: { ssoProtection: { deploymentType: string | null } | null; passwordProtection: boolean; trustedIps: boolean } | null;
  env?: { key: string; targets: string[]; type: string }[] | null;
};

export type VercelDeployment = {
  id: string;
  url: string | null;
  /** READY, ERROR, BUILDING, CANCELED, QUEUED, INITIALIZING, BLOCKED, DELETED. */
  state: string | null;
  target: "production" | "preview";
  createdAt: string | null;
  readyAt: string | null;
  /** cli, git, redeploy, import and so on. */
  source: string | null;
  errorCode: string | null;
  inspectorUrl: string | null;
  /** The commit this deployment built, from Vercel's git metadata, when it deployed from git. */
  commit: { sha: string; ref: string | null; message: string | null } | null;
};

const iso = (ms: unknown): string | null => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const idStr = (v: unknown): string | null => (typeof v === "number" ? String(v) : str(v));
const withScheme = (url: string | null) => (url && !/^https?:\/\//.test(url) ? `https://${url}` : url);

/** A deployment from either shape Vercel uses (project targets and the deployments list). Nothing secret lives here. */
export function pickDeployment(raw: Record<string, unknown> | null | undefined): VercelDeployment | null {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id) ?? str(raw.uid);
  if (!id) return null;
  const state = str(raw.readyState) ?? str(raw.state);
  const meta = raw.meta && typeof raw.meta === "object" ? (raw.meta as Record<string, unknown>) : null;
  const sha = str(meta?.githubCommitSha) ?? str(meta?.gitlabCommitSha) ?? str(meta?.bitbucketCommitSha);
  const message = str(meta?.githubCommitMessage) ?? str(meta?.gitlabCommitMessage) ?? str(meta?.bitbucketCommitMessage);
  return {
    id,
    url: withScheme(str(raw.url)),
    state,
    target: raw.target === "production" ? "production" : "preview",
    createdAt: iso(raw.createdAt) ?? iso(raw.created),
    readyAt: iso(raw.readyAt) ?? iso(raw.ready),
    source: str(raw.source),
    errorCode: str(raw.errorCode),
    inspectorUrl: str(raw.inspectorUrl),
    commit: sha ? { sha, ref: str(meta?.githubCommitRef) ?? str(meta?.gitlabCommitRef) ?? str(meta?.bitbucketCommitRef), message: message ? message.split("\n")[0].slice(0, 120) : null } : null,
  };
}

/** Names, targets and types of a project's variables; every value is dropped here. Not a list means not readable. */
function pickEnv(list: unknown): VercelProject["env"] {
  if (!Array.isArray(list)) return null;
  return list.map((item: unknown) => {
    const v = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { key: str(v.key) ?? "", targets: Array.isArray(v.target) ? v.target.filter((t): t is string => typeof t === "string") : typeof v.target === "string" ? [v.target] : [], type: str(v.type) ?? "" };
  }).filter((v) => v.key);
}

/** Reduce a raw project before it can reach storage. Values are discarded here. */
export function pickProject(raw: Record<string, unknown>): VercelProject {
  const link = raw.link && typeof raw.link === "object" ? (raw.link as Record<string, unknown>) : null;
  const targets = raw.targets && typeof raw.targets === "object" ? (raw.targets as Record<string, unknown>) : null;
  const production = pickDeployment(targets?.production as Record<string, unknown> | undefined);
  const latestList = Array.isArray(raw.latestDeployments) ? (raw.latestDeployments as Record<string, unknown>[]) : [];
  const latest = latestList.map(pickDeployment).filter((d): d is VercelDeployment => Boolean(d)).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
  const hasProtection = ["ssoProtection", "passwordProtection", "trustedIps"].some((k) => Object.hasOwn(raw, k));
  const env = pickEnv(raw.env);
  return {
    id: String(raw.id),
    name: String(raw.name),
    accountId: String(raw.accountId ?? ""),
    framework: str(raw.framework),
    nodeVersion: str(raw.nodeVersion),
    live: raw.live === true,
    paused: raw.paused === true,
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
    repo:
      link && str(link.org) && str(link.repo)
        ? { type: str(link.type) ?? "git", org: String(link.org), repo: String(link.repo), repoId: idStr(link.repoId), productionBranch: str(link.productionBranch) }
        : null,
    production: production ? { ...production, target: "production" } : null,
    latest,
    schedules: pickSchedules(raw),
    cronDeploymentId: raw.crons && typeof raw.crons === "object" ? str((raw.crons as Record<string, unknown>).deploymentId) : null,
    protection: hasProtection ? {
      ssoProtection: raw.ssoProtection && typeof raw.ssoProtection === "object" ? { deploymentType: str((raw.ssoProtection as Record<string, unknown>).deploymentType) } : null,
      passwordProtection: Boolean(raw.passwordProtection),
      trustedIps: Array.isArray(raw.trustedIps) ? raw.trustedIps.length > 0 : Boolean(raw.trustedIps),
    } : null,
    env,
  };
}

/** Settings may be absent from list responses. Read one project for its check inputs. */
export async function getProjectChecksInput(token: string, scope: VercelScope, projectId: string): Promise<Pick<VercelProject, "protection" | "env" | "schedules">> {
  const raw = await vercelGet<Record<string, unknown>>(token, `/v9/projects/${encodeURIComponent(projectId)}`, teamQuery(scope));
  const picked = pickProject(raw);
  // Vercel leaves the variable list off a project that has none. Ask the list itself, so an empty
  // project reads as "nothing to check" and only a refusal reads as "not readable".
  let env = picked.env;
  if (!env) {
    try {
      env = pickEnv((await vercelGet<{ envs?: unknown }>(token, `/v10/projects/${encodeURIComponent(projectId)}/env`, teamQuery(scope))).envs);
    } catch {
      // Refused or failed: the rules answer "unknown" for the variables and still judge protection.
    }
  }
  return { protection: picked.protection, env, schedules: picked.schedules };
}

type RawProjectsPage = Record<string, unknown>[] | { projects: Record<string, unknown>[]; pagination?: { next?: number | string | null } };

/** Every project in a scope, 100 per page, following pagination.next. Stops at maxPages and says so. */
export async function listProjects(token: string, scope: VercelScope, maxPages = 50): Promise<{ projects: VercelProject[]; truncated: boolean }> {
  const projects: VercelProject[] = [];
  let until: number | string | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const body = await vercelGet<RawProjectsPage>(token, "/v10/projects", { ...teamQuery(scope), limit: 100, until });
    const list = Array.isArray(body) ? body : body.projects;
    for (const p of list) projects.push(pickProject(p));
    const next = Array.isArray(body) ? null : (body.pagination?.next ?? null);
    if (!next || list.length === 0) return { projects, truncated: false };
    until = next;
  }
  return { projects, truncated: true };
}

/**
 * Which deployments of a project the map keeps, and from where:
 * - production: the project's own targets.production (what Vercel serves now, rollbacks included),
 *   falling back to the newest READY production deployment in the recent list;
 * - latest: the newest deployment of any target;
 * - lastFailure: the newest ERROR or CANCELED among the recent list, which is bounded, so the
 *   caller says "recent failure", not "last failure ever".
 */
export function chooseDeployments(project: VercelProject, recent: VercelDeployment[]) {
  const newestFirst = [...recent].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  // The project's own production target names the deployment Vercel serves; the deployments list
  // has the richer record of it (inspector link, source, commit), so prefer that one when it is there.
  const target = project.production;
  const production = (target && (newestFirst.find((d) => d.id === target.id) ?? target)) ?? newestFirst.find((d) => d.target === "production" && d.state === "READY") ?? null;
  const latest = newestFirst[0] ?? project.latest ?? null;
  const lastFailure = newestFirst.find((d) => d.state === "ERROR" || d.state === "CANCELED") ?? null;
  const newestPreview = newestFirst.find((d) => d.target === "preview") ?? (project.latest?.target === "preview" ? project.latest : null);
  return { production, latest, lastFailure, newestPreview };
}

// ---------- Billing ----------

/**
 * Billing charges for one scope, FOCUS v1.3 rows sent as JSON lines (docs: GET /v1/billing/charges,
 * 1-day granularity, up to a year). Vercel answers only for team roles that may see billing.
 */
export async function listBillingCharges(token: string, scope: VercelScope, from: string, to: string): Promise<string> {
  return (await vercelGetResponse(token, "/v1/billing/charges", { ...teamQuery(scope), from, to }, "application/jsonl, application/json")).text();
}

// ---------- Domains ----------

export type VercelDomain = { name: string; verified: boolean; redirect: string | null; createdAt: string | null };
export type VercelRegistration = { name: string; expiresAt: string | null; autoRenew: boolean | null; registeredHere: boolean };

type RawDomains = { domains: { name: string; verified?: boolean; redirect?: string | null; createdAt?: number }[]; pagination?: { next?: number | null } };

/** Every domain attached to a project, following pagination.next. Redirect-only domains are kept and marked. */
export async function listProjectDomains(token: string, scope: VercelScope, projectId: string, maxPages = 10): Promise<VercelDomain[]> {
  const out: VercelDomain[] = [];
  let until: number | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const body = await vercelGet<RawDomains>(token, `/v9/projects/${encodeURIComponent(projectId)}/domains`, { ...teamQuery(scope), limit: 100, until });
    for (const d of body.domains ?? []) out.push({ name: d.name.toLowerCase(), verified: d.verified === true, redirect: str(d.redirect), createdAt: iso(d.createdAt) });
    const next = body.pagination?.next ?? null;
    if (!next || !(body.domains ?? []).length) break;
    until = next;
  }
  return out;
}

/** Account registration dates, separate from the domains attached to projects. GET only. */
export async function listAccountDomains(token: string, scope: VercelScope, maxPages = 100): Promise<VercelRegistration[]> {
  const out: VercelRegistration[] = [];
  let until: number | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const body = await vercelGet<{ domains: { name?: string; boughtAt?: number | null; transferredAt?: number | null; expiresAt?: number | null; renew?: boolean | null }[]; pagination?: { next?: number | null } }>(token, "/v5/domains", { ...teamQuery(scope), limit: 100, until });
    for (const d of body.domains ?? []) {
      const date = iso(d.expiresAt);
      if (d.name) out.push({ name: d.name.toLowerCase(), expiresAt: d.boughtAt || d.transferredAt ? date : null, autoRenew: typeof d.renew === "boolean" ? d.renew : null, registeredHere: Boolean(d.boughtAt || d.transferredAt) });
    }
    const next = body.pagination?.next ?? null;
    if (!next || !(body.domains ?? []).length) break;
    if (page === maxPages) throw new Error("vercel account domain list exceeded page limit");
    until = next;
  }
  return out;
}

// ---------- Deployments ----------

type RawDeployments = { deployments: Record<string, unknown>[] };

/** The newest deployments of a project, newest first. Enough to see recent failures and when production last changed. */
export async function listDeployments(token: string, scope: VercelScope, projectId: string, limit = 20): Promise<VercelDeployment[]> {
  const body = await vercelGet<RawDeployments>(token, "/v7/deployments", { ...teamQuery(scope), projectId, limit });
  return (body.deployments ?? []).map(pickDeployment).filter((d): d is VercelDeployment => Boolean(d));
}

// ---------- States ----------

/**
 * Vercel states in the vocabulary GitHub deployments already use, so every rule that
 * reads deployment nodes (live, failed, idle) works unchanged. The raw state is kept
 * beside it on the node.
 */
export function githubStateOf(vercelState: string | null): string | null {
  switch (vercelState) {
    case "READY":
      return "success";
    case "ERROR":
      return "error";
    case "CANCELED":
    case "DELETED":
      return "inactive";
    case "BUILDING":
    case "INITIALIZING":
      return "in_progress";
    case "QUEUED":
      return "queued";
    case "BLOCKED":
      return "pending";
    default:
      return vercelState ? vercelState.toLowerCase() : null;
  }
}

// ---------- Build logs ----------

type RawEvent = { type?: string; text?: string; level?: string; created?: number; date?: number; payload?: { text?: string; date?: number; created?: number } };

/** Event kinds that carry log text. Metrics, delimiters and state changes do not. */
const LOG_EVENT_TYPES = new Set(["stdout", "stderr", "command", "fatal", "exit"]);

/**
 * The build log of one deployment, oldest first, text only. Read with `limit=-1` so a long
 * build is not cut before its failing line; the tail is trimmed afterwards in code.
 */
export async function listDeploymentEvents(token: string, scope: VercelScope, deploymentId: string): Promise<{ text: string; type: string; at: number | null }[]> {
  const body = await vercelGet<RawEvent[] | null>(token, `/v3/deployments/${encodeURIComponent(deploymentId)}/events`, { ...teamQuery(scope), limit: -1, direction: "forward", builds: 1 });
  const out: { text: string; type: string; at: number | null }[] = [];
  for (const e of body ?? []) {
    const type = typeof e.type === "string" ? e.type : "";
    if (!LOG_EVENT_TYPES.has(type)) continue;
    const text = typeof e.text === "string" ? e.text : typeof e.payload?.text === "string" ? e.payload.text : "";
    if (!text.trim()) continue;
    const at = e.created ?? e.date ?? e.payload?.created ?? e.payload?.date ?? null;
    out.push({ text, type, at: typeof at === "number" ? at : null });
  }
  return out;
}

/** Lines the tail keeps. Enough to read a stack trace; small enough to sit on a node. */
export const LOG_TAIL_LINES = 40;
const LINE_MAX = 300;

/**
 * A value that must never leave a build log: a Bearer token, a long opaque word, or the value
 * side of KEY=VALUE when the key looks like a secret. Build logs rarely print these, but a user's
 * own `echo $DATABASE_URL` would, and the log tail sits on a node the API returns.
 */
export function scrubLogLine(line: string): string {
  return line
    .replace(/\b(Bearer|token|Token)\s+[A-Za-z0-9._~+/=-]{16,}/g, "$1 [redacted]")
    .replace(/\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DATABASE_URL|DSN)[A-Z0-9_]*)\s*[=:]\s*\S+/g, "$1=[redacted]")
    .replace(/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"']+/gi, "$1://[redacted]")
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|vcp|xox[abp]|AKIA)[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9+/_-]{48,}={0,2}\b/g, "[redacted]")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .slice(0, LINE_MAX);
}

/** The lines that usually name the failure, searched from the end. */
const CAUSE_RE = /\b(error|err!|failed|failure|cannot|can't|could not|not found|missing|unexpected|exited with|exit code [1-9]|ENOENT|EACCES|TypeError|SyntaxError|ReferenceError|Module not found|Type error)\b/i;
/** Boilerplate that says a build failed without saying why. */
const BOILERPLATE_RE = /^(error: )?(\[[a-z0-9_]+\] )?(command .* exited with \d+|build failed|deployment failed|npm err! .*exit status|npm err! a complete log of this run|process completed with exit code \d+|the process .* failed with exit code \d+)/i;
/** npm's own report that a script failed: the script, code, path and command, never the reason. */
const NPM_LIFECYCLE_RE = /^npm (error|err!) (lifecycle script|code |path |workspace |location |command |errno |a complete log)/i;
/** A line that opens an error report: "Error [X]: ...", "TypeError: ...", "Type error: ...", "Module not found: ...". */
const HEADLINE_RE = /^(?:[⨯✖×]\s*)?(?:[A-Za-z]*Error(?: \[[A-Za-z0-9_]+\])?:|Error \[[A-Za-z0-9_]+\]:|Type error:|Module not found:|Failed to compile)/;

/**
 * The last LOG_TAIL_LINES scrubbed lines of a build log, and the one line most likely to be
 * the reason: the last line that opens an error report ("Error [X]: ...", "TypeError: ..."), else
 * the last line that names an error and is not boilerplate, else the last boilerplate error
 * line, else the last line. Deterministic, no model.
 */
export function logTailAndCause(events: { text: string }[]): { tail: string[]; cause: string | null } {
  const lines = events
    .flatMap((e) => e.text.split(/\r?\n/))
    .map((l) => scrubLogLine(l.trimEnd()))
    .filter((l) => l.trim().length > 0);
  const tail = lines.slice(-LOG_TAIL_LINES);
  const isBoilerplate = (l: string) => BOILERPLATE_RE.test(l) || NPM_LIFECYCLE_RE.test(l);
  // First choice: the last line that opens an error report. A mention mid-sentence or npm's
  // lifecycle summary under it says less than the headline does.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (HEADLINE_RE.test(l) && !isBoilerplate(l)) return { tail, cause: l };
  }
  let cause: string | null = null;
  let fallback: string | null = null;
  for (let i = lines.length - 1; i >= 0 && !cause; i--) {
    const l = lines[i].trim();
    if (!CAUSE_RE.test(l)) continue;
    if (isBoilerplate(l)) {
      fallback = fallback ?? l;
      continue;
    }
    cause = l;
  }
  return { tail, cause: cause ?? fallback ?? (lines.length ? lines[lines.length - 1].trim() : null) };
}
