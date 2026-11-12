/**
 * Steps for the Vercel inventory, read with a pasted token: every project in
 * every scope the token proved it can read, its production and newest
 * deployments, and its domains. Writes project, deployment and domain nodes, a
 * provider_account node per scope, and edges with provenance. When a project
 * deploys from a GitHub repo the map already knows (matched by GitHub's repo
 * id, then by name), the deployments hang off that repo too, so the project
 * page shows them. Read-only: the client can only GET.
 *
 * The token is decrypted inside each step and never crosses a step boundary.
 * Every step derives the owner from the connection row, never from its input.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { FatalError, RetryableError } from "workflow";
import { getDb, schema } from "@/db";
import { projectDecisions, slimForSync, type SyncProject } from "@/lib/checks/rules";
import { readChecks, saveCheck } from "@/lib/checks/store";
import type { Connection } from "@/db/schema";
import { notifyDeployFailed } from "@/lib/alerts/deploy-failed";
import { registrationAttributes } from "@/lib/expirations/domains";
import { getAccessToken, getConnection, markConnectionErrored } from "@/lib/connections";
import { installDisplayName, isPlaceholderDisplay, readVercelInstallMeta } from "@/lib/vercel-integration";
import { upsertEdge, upsertNode } from "@/lib/graph";
import { syncScheduleJobs } from "@/lib/vercel-watch";
import { detectServices } from "@/lib/services/catalog";
import { billedServices, billingWindow, parseJsonLines, rowsForAccount } from "@/lib/services/billing";
import { setAccountBilling, syncBilledServices, syncProjectBills, syncProjectServices } from "@/lib/services/store";
import {
  VercelApiError,
  VercelNoReadableScope,
  chooseDeployments,
  githubStateOf,
  getProjectChecksInput,
  identifyToken,
  listAccountDomains,
  listDeploymentEvents,
  listBillingCharges,
  listDeployments,
  logTailAndCause,
  listProjectDomains,
  listProjects,
  type VercelDeployment,
  type VercelProject,
  type VercelScope,
  type VercelRegistration,
} from "@/lib/providers/vercel";

const SOURCE = "vercel" as const;

/** A 401 or 403 means Vercel no longer honors the token: the connection needs a new one. Rate limits retry. */
async function guarded<T>(c: Connection, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof VercelApiError) {
      if (err.retryAfterMs !== null) throw new RetryableError("vercel rate limited", { retryAfter: err.retryAfterMs });
      if (err.status === 401 || err.status === 403) {
        if (c.status === "active") await markConnectionErrored(c, "Vercel no longer accepts this token. Paste a new one.");
        throw new FatalError("Vercel no longer accepts this token");
      }
    }
    if (err instanceof VercelNoReadableScope) {
      if (c.status === "active") await markConnectionErrored(c, "This Vercel token reads no account or team. Paste one with a wider scope.");
      throw new FatalError("Vercel token reads no scope");
    }
    throw err;
  }
}

/** The connection and its token, checked to be active and, when a caller names an owner, owned by that user. */
async function open(connectionId: string, expectUserId?: string): Promise<{ c: Connection; token: string }> {
  const c = await getConnection(connectionId);
  if (!c || c.provider !== "vercel") throw new FatalError("connection not found");
  if (expectUserId && c.userId !== expectUserId) throw new FatalError("connection belongs to another user");
  let token: string;
  try {
    token = await getAccessToken(connectionId);
  } catch (err) {
    if ((err as Error).message === "connection is not active") throw new FatalError("Connection is not active");
    throw err;
  }
  return { c, token };
}

/** Who the token is, and one provider_account node per scope it proved it reads. */
export async function ensureVercelAccounts(connectionId: string) {
  "use step";
  const { c, token } = await open(connectionId);
  const install = readVercelInstallMeta(c.scopes);
  // An install saved before the account's name could be read gets its real name on the next sync.
  if (install && isPlaceholderDisplay(c.display)) {
    const named = await installDisplayName(token, install.teamId);
    if (named) {
      await getDb().update(schema.connections).set({ display: named }).where(eq(schema.connections.id, c.id));
      c.display = named;
    }
  }
  // Integration tokens are bound to one selected account or team. For team
  // installs every REST read must carry teamId; the pasted-token probe does not.
  const scopes: VercelScope[] = install
    ? [{ kind: install.teamId ? "team" : "user", id: install.teamId ?? c.externalAccountId.slice(5), slug: c.display, name: c.display }]
    : (await guarded(c, () => identifyToken(token))).scopes;
  const accounts: { scope: VercelScope; nodeId: string }[] = [];
  for (const scope of scopes) {
    const externalKey = scope.id === "scoped" ? `vercel:account:connection-${c.id}` : `vercel:account:${scope.id}`;
    // The last billing read lives on this node; a re-sync keeps it.
    const [previous] = await getDb().select({ attributes: schema.nodes.attributes }).from(schema.nodes)
      .where(and(eq(schema.nodes.userId, c.userId), eq(schema.nodes.kind, "provider_account"), eq(schema.nodes.externalKey, externalKey))).limit(1);
    const nodeId = await upsertNode({
      userId: c.userId,
      kind: "provider_account",
      externalKey,
      name: scope.kind === "team" ? `${scope.name} (Vercel team)` : `${scope.name} (Vercel)`,
      attributes: { provider: "vercel", scope_kind: scope.kind, slug: scope.slug, connection_id: c.id, ...(previous?.attributes.billing ? { billing: previous.attributes.billing } : {}) },
      status: "active",
    });
    accounts.push({ scope, nodeId });
  }
  return { userId: c.userId, accounts };
}

/** Every project in one scope. */
export async function listScopeProjects(connectionId: string, scope: VercelScope) {
  "use step";
  const { c, token } = await open(connectionId);
  const list = await guarded(c, () => listProjects(token, scope));
  // A step's result is kept by the workflow engine. Decide the settings checks here and drop the
  // list of variable names and the protection settings, so only the decisions travel on.
  // An integration may read projects but be refused the account domain list.
  // Null means preserve any registration facts already on domain nodes.
  let registrations: VercelRegistration[] | null = null;
  // A failed read of this extra list must not fail the project sync; the dates already stored stay.
  try { registrations = await listAccountDomains(token, scope); } catch (err) {
    if (!(err instanceof VercelApiError && [401, 403, 404].includes(err.status))) console.error("[vercel] account domains", (err as Error).message);
  }
  return { ...list, registrations, projects: list.projects.map(slimForSync) };
}

const deploymentAttributes = (d: VercelDeployment, project: VercelProject) => ({
  environment: d.target,
  url: d.url,
  state: githubStateOf(d.state),
  vercel_state: d.state,
  // The host, in the same slot GitHub deployments use for the deploying bot, so providerOf() names Vercel.
  creator: "vercel",
  provider: "Vercel",
  source: d.source,
  error_code: d.errorCode,
  inspector_url: d.inspectorUrl,
  commit_sha: d.commit?.sha ?? null,
  commit_ref: d.commit?.ref ?? null,
  commit_message: d.commit?.message ?? null,
  project_id: project.id,
  deployment_id: d.id,
});

/** The GitHub repo node this project deploys from: by GitHub's repo id first, then by full name. Null when the map has none. */
async function linkedRepoNodeId(userId: string, project: VercelProject): Promise<string | null> {
  if (project.repo?.type !== "github") return null;
  const db = getDb();
  if (project.repo.repoId) {
    const [byId] = await db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"), eq(schema.nodes.externalKey, `github:repo:${project.repo.repoId}`)))
      .limit(1);
    if (byId) return byId.id;
  }
  const [byName] = await db
    .select({ id: schema.nodes.id })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"), eq(schema.nodes.name, `${project.repo.org}/${project.repo.repo}`)))
    .limit(1);
  return byName?.id ?? null;
}

/**
 * One project: its node, its production and newest deployments, its domains, and the
 * edges to its account and to the GitHub repo it deploys from when the map knows it.
 * Edges from any other repo to this project or its deployments are removed, so a
 * relink on Vercel moves the project rather than leaving it under the old repo.
 */
type ProjectSyncInput = { connectionId: string; userId: string; accountNodeId: string; scope: VercelScope; project: SyncProject; registrations: VercelRegistration[] | null };

async function syncOneVercelProject(input: ProjectSyncInput) {
  const { project, scope } = input;
  const { c, token } = await open(input.connectionId, input.userId);
  const userId = c.userId;
  const at = new Date().toISOString();
  const db = getDb();

  const recent = await guarded(c, () => listDeployments(token, scope, project.id, 20));
  const { production, latest, lastFailure, newestPreview } = chooseDeployments(project, recent);
  await syncScheduleJobs({ userId, connectionId: c.id, projectId: project.id, projectName: project.name, scopeId: `${scope.kind}:${scope.id}`, deploymentId: project.cronDeploymentId ?? production?.id ?? null, hasProduction: Boolean(production), schedules: project.schedules ?? [] });
  const lastActivity = latest?.createdAt ?? project.updatedAt;
  const [previous] = await db.select({ attributes: schema.nodes.attributes }).from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project"), eq(schema.nodes.externalKey, `vercel:project:${project.id}`))).limit(1);

  const projectNodeId = await upsertNode({
    userId,
    kind: "project",
    externalKey: `vercel:project:${project.id}`,
    name: project.name,
    attributes: {
      provider: "vercel",
      framework: project.framework,
      node_version: project.nodeVersion,
      live: project.live,
      paused: project.paused,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      repo: project.repo ? `${project.repo.org}/${project.repo.repo}` : null,
      repo_provider: project.repo?.type ?? null,
      repo_external_id: project.repo?.repoId ?? null,
      production_branch: project.repo?.productionBranch ?? null,
      production_url: production?.url ?? null,
      production_deployment_id: production?.id ?? null,
      recent_failure_at: lastFailure?.createdAt ?? null,
      recent_failure_code: lastFailure?.errorCode ?? null,
      scope_id: scope.id,
      scope_slug: scope.slug,
      scope_kind: scope.kind,
      connection_id: c.id,
      ...(previous?.attributes.uptime ? { uptime: previous.attributes.uptime } : {}),
      ...(previous?.attributes.errorRate ? { errorRate: previous.attributes.errorRate } : {}),
      ...(previous?.attributes.vercel_bill ? { vercel_bill: previous.attributes.vercel_bill } : {}),
    },
    status: project.paused ? "paused" : production ? "live" : latest ? (githubStateOf(latest.state) ?? null) : "no deployments",
    lastActivityAt: lastActivity ? new Date(lastActivity) : null,
  });
  await upsertEdge({ userId, fromNodeId: input.accountNodeId, toNodeId: projectNodeId, kind: "owns", confidence: 1, provenance: { source: SOURCE, call: "GET /v10/projects", at } });
  let decisions = project.checks;
  let services = project.services;
  if (!decisions) {
    // The list did not carry settings. Read this one project; if that is refused the rules answer "unknown".
    let settings: Pick<VercelProject, "protection" | "env"> = { protection: null, env: null };
    try { settings = await getProjectChecksInput(token, scope, project.id); } catch { /* not readable with this connection */ }
    decisions = projectDecisions({ ...settings, schedules: project.schedules });
    if (settings.env) services = detectServices(settings.env.map((v) => v.key));
  }
  if (services) await syncProjectServices(userId, projectNodeId, services, at);
  await saveCheck(userId, projectNodeId, "previews_open", decisions.previews);
  await saveCheck(userId, projectNodeId, "secret_not_sensitive", decisions.sensitive);
  await saveCheck(userId, projectNodeId, "cron_unguarded", decisions.cron);
  const publicName = decisions.publicName;
  if (publicName) await saveCheck(userId, projectNodeId, "secret_in_public_code", publicName);
  else {
    const priorPublic = (await readChecks(userId)).rows.find((r) => r.nodeId === projectNodeId && r.check === "secret_in_public_code");
    if (priorPublic?.evidence.kind === "name") await saveCheck(userId, projectNodeId, "secret_in_public_code", { state: "unknown", reason: production?.url ? "scan_pending" : "no_production_site", evidence: {} });
  }

  // The GitHub repo this project deploys from. Any other repo's link to this project goes.
  const repoNodeId = await linkedRepoNodeId(userId, project);
  await db
    .delete(schema.edges)
    .where(and(eq(schema.edges.userId, userId), eq(schema.edges.toNodeId, projectNodeId), eq(schema.edges.kind, "hosted_on"), ...(repoNodeId ? [ne(schema.edges.fromNodeId, repoNodeId)] : [])));
  if (repoNodeId) {
    await upsertEdge({ userId, fromNodeId: repoNodeId, toNodeId: projectNodeId, kind: "hosted_on", confidence: 1, provenance: { source: SOURCE, call: "GET /v10/projects (link)", at } });
  }

  // Deployment nodes: production, the newest preview, and the newest of all when it is neither (a fresh failure).
  const picks: { key: string; d: VercelDeployment }[] = [];
  if (production) picks.push({ key: "production", d: production });
  if (newestPreview && newestPreview.id !== production?.id) picks.push({ key: "preview", d: newestPreview });
  if (latest && latest.id !== production?.id && latest.id !== newestPreview?.id) picks.push({ key: "latest", d: latest });
  const depNodeIds: string[] = [];
  for (const { key, d } of picks) {
    const externalKey = `vercel:deployment:${project.id}:${key}`;
    // A failed build gets its log tail and the line that names the cause, read once per deployment.
    let logFacts: { log_tail: string[]; cause: string | null; log_read_at: string } | null = null;
    if (d.state === "ERROR") {
      const [existing] = await db
        .select({ attributes: schema.nodes.attributes })
        .from(schema.nodes)
        .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"), eq(schema.nodes.externalKey, externalKey)))
        .limit(1);
      const prior = existing?.attributes as Record<string, unknown> | undefined;
      if (prior && prior.deployment_id === d.id && Array.isArray(prior.log_tail)) {
        logFacts = { log_tail: prior.log_tail as string[], cause: typeof prior.cause === "string" ? prior.cause : null, log_read_at: String(prior.log_read_at ?? at) };
      } else {
        try {
          const events = await guarded(c, () => listDeploymentEvents(token, scope, d.id));
          const { tail, cause } = logTailAndCause(events);
          logFacts = { log_tail: tail, cause, log_read_at: at };
        } catch (err) {
          if (err instanceof FatalError || err instanceof RetryableError) throw err;
          // A log that cannot be read is not a reason to lose the deployment itself.
          logFacts = { log_tail: [], cause: null, log_read_at: at };
        }
        // First sight of this failure: tell the person, once, if it is fresh. Never throws.
        await notifyDeployFailed(userId, {
          deploymentId: d.id,
          project: project.repo ? `${project.repo.org}/${project.repo.repo}` : `${scope.slug}/${project.name}`,
          environment: d.target,
          host: "Vercel",
          at: d.createdAt,
          cause: logFacts.cause,
          logTail: logFacts.log_tail,
          inspectorUrl: d.inspectorUrl,
          url: d.url,
        });
      }
    }
    const depNodeId = await upsertNode({
      userId,
      kind: "deployment",
      externalKey,
      name: `${project.name} (${d.target}, Vercel)`,
      attributes: { ...deploymentAttributes(d, project), ...(logFacts ?? {}) },
      status: githubStateOf(d.state),
      lastActivityAt: d.createdAt ? new Date(d.createdAt) : null,
    });
    depNodeIds.push(depNodeId);
    const provenance = { source: SOURCE, call: "GET /v7/deployments", at };
    await upsertEdge({ userId, fromNodeId: projectNodeId, toNodeId: depNodeId, kind: "deploys", confidence: 1, provenance });
    if (repoNodeId) await upsertEdge({ userId, fromNodeId: repoNodeId, toNodeId: depNodeId, kind: "deploys", confidence: 1, provenance });
  }
  // Deploys edges to these deployments from anything other than this project and its current repo are stale.
  if (depNodeIds.length) {
    const keep = repoNodeId ? [projectNodeId, repoNodeId] : [projectNodeId];
    const stale = await db
      .select({ id: schema.edges.id, fromNodeId: schema.edges.fromNodeId })
      .from(schema.edges)
      .where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "deploys"), inArray(schema.edges.toNodeId, depNodeIds)));
    const staleIds = stale.filter((e) => !keep.includes(e.fromNodeId)).map((e) => e.id);
    if (staleIds.length) await db.delete(schema.edges).where(inArray(schema.edges.id, staleIds));
  }

  // Domains. A redirect-only domain (www to apex) is kept and marked, not counted as a second site.
  const domains = await guarded(c, () => listProjectDomains(token, scope, project.id));
  for (const dom of domains) {
    const [previousDomain] = await db.select({ attributes: schema.nodes.attributes }).from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "domain"), eq(schema.nodes.externalKey, `domain:${dom.name}`))).limit(1);
    const knownRegistration = registrationAttributes(previousDomain?.attributes, input.registrations, dom.name);
    const domainNodeId = await upsertNode({
      userId,
      kind: "domain",
      externalKey: `domain:${dom.name}`,
      name: dom.name,
      attributes: { verified: dom.verified, redirect_to: dom.redirect, added_at: dom.createdAt, provider: "vercel", ...knownRegistration },
      status: dom.verified ? "verified" : "unverified",
    });
    await upsertEdge({ userId, fromNodeId: domainNodeId, toNodeId: projectNodeId, kind: "points_to", confidence: 1, provenance: { source: SOURCE, call: `GET /v9/projects/${project.id}/domains`, at } });
  }
  return { deployments: picks.length, domains: domains.length };
}

/**
 * This scope's bill for the last 30 days, from GET /v1/billing/charges: each Marketplace seller's
 * cost on its service, and every charge, Vercel's own included, as a total per project and product.
 * Read only with a pasted token: the integration does not ask for billing. A refusal is recorded on
 * the account and never marks the connection broken, since the rest of the sync still works.
 */
export async function syncVercelBilling(input: { connectionId: string; userId: string; accountNodeId: string; scope: VercelScope }) {
  "use step";
  const { c, token } = await open(input.connectionId, input.userId);
  const at = new Date().toISOString();
  if (readVercelInstallMeta(c.scopes)) {
    await setAccountBilling(c.userId, input.accountNodeId, { state: "not_readable", at });
    return { services: 0, state: "not_readable" as const };
  }
  const period = billingWindow(Date.now());
  let text: string;
  try { text = await listBillingCharges(token, input.scope, period.from, period.to); } catch (err) {
    const state = err instanceof VercelApiError && [400, 401, 403, 404].includes(err.status) ? "not_readable" as const : "unavailable" as const;
    if (state === "unavailable") console.error("[vercel] billing", (err as Error).message);
    await setAccountBilling(c.userId, input.accountNodeId, { state, at });
    return { services: 0, state };
  }
  const all = parseJsonLines(text);
  if (!all) {
    // A cut-off or garbled answer would lower costs and drop links; keep the last good read instead.
    console.error("[vercel] billing answer had unreadable lines");
    await setAccountBilling(c.userId, input.accountNodeId, { state: "unavailable", at });
    return { services: 0, state: "unavailable" as const };
  }
  const rows = rowsForAccount(all, input.scope.id);
  if (!rows) {
    // A user scope asked without a team gets its default team's bill; that team's own read shows it.
    await syncBilledServices(c.userId, { key: `${input.scope.kind}:${input.scope.id}`, id: input.scope.id }, [], period, at);
    await setAccountBilling(c.userId, input.accountNodeId, { state: "other_account", at });
    return { services: 0, state: "other_account" as const };
  }
  const billed = billedServices(rows);
  await syncBilledServices(c.userId, { key: `${input.scope.kind}:${input.scope.id}`, id: input.scope.id }, billed, period, at);
  const { unassigned, chargedCents } = await syncProjectBills(c.userId, input.scope.id, rows, period, at);
  await setAccountBilling(c.userId, input.accountNodeId, { state: "read", from: period.from, to: period.to, at, unassigned, chargedCents });
  return { services: billed.length, state: "read" as const };
}

/**
 * Several projects in one step. The watcher re-reads every project every 5 minutes, and each
 * workflow step is billed as events, so one step per project cost far more than the reads.
 * A failure retries the batch; every write is an upsert, so a retry is safe.
 */
export async function syncVercelProjects(input: Omit<ProjectSyncInput, "project"> & { projects: SyncProject[]; syncRunId: string; scannedBefore: number }) {
  "use step";
  const { projects, syncRunId, scannedBefore, ...rest } = input;
  for (const project of projects) await syncOneVercelProject({ ...rest, project });
  await getDb().update(schema.syncRuns).set({ scanned: scannedBefore + projects.length, updatedAt: new Date() }).where(eq(schema.syncRuns.id, syncRunId));
  return projects.length;
}

/** Done. When a scope had more projects than the run read, the run says so instead of claiming the whole account. */
export async function markVercelSynced(connectionId: string, syncRunId: string, projects: number, truncated: boolean) {
  "use step";
  const now = new Date();
  await getDb().update(schema.connections).set({ lastSyncedAt: now }).where(eq(schema.connections.id, connectionId));
  await getDb()
    .update(schema.syncRuns)
    .set({
      phase: "done",
      scanned: projects,
      cursor: null,
      finishedAt: now,
      updatedAt: now,
      error: truncated ? "Read the first 5,000 projects of a scope; the rest are not on the map yet." : null,
    })
    .where(eq(schema.syncRuns.id, syncRunId));
}
