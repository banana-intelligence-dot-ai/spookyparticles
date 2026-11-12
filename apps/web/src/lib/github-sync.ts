/**
 * The per-repo GitHub sync, as plain functions: repo node, latest deployment per
 * environment, the newest run of each Actions workflow, and the alert for a fresh failure.
 * Shared by the inventory step (src/workflows/steps/github.ts) and by the on-demand refresh
 * an agent triggers after a push (src/lib/github-refresh.ts). Kept out of the steps file so
 * the workflow bundle never pulls Node-only modules (posthog-node) into its sandbox.
 */
import { and, eq, sql } from "drizzle-orm";
import { RetryableError } from "workflow";
import { getDb, schema } from "@/db";
import { notifyDeployFailed } from "@/lib/alerts/deploy-failed";
import { upsertEdge, upsertNode } from "@/lib/graph";
import { actionsTailAndCause, failingStep, latestRunPerWorkflow, looksLikeDeploy, stateOfRun, type WorkflowJob, type WorkflowRun } from "@/lib/providers/github-actions";
import { GITHUB_API, githubHeaders } from "@/lib/providers/github-app";
import { providerOf } from "@/lib/hosts";
import type { ProductionDeployment } from "@/lib/move-home";
import { recordProductionMove } from "@/lib/move-home-record";

export type RepoRef = {
  id: number;
  fullName: string;
  private: boolean;
  archived: boolean;
  htmlUrl: string;
  pushedAt: string | null;
  defaultBranch: string;
  language: string | null;
};

export type GhResult<T> = { data: T; hasNext: boolean; rateRemaining: number | null; status: number };

/** Statuses that mean "nothing here" for a repo's deployments, not a failure. */
export const EMPTY_STATUSES = new Set([404, 409]);

export async function gh<T>(token: string, path: string, opts: { emptyOn?: Set<number>; empty?: T } = {}): Promise<GhResult<T>> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token) });
  const remainingHeader = res.headers.get("x-ratelimit-remaining");
  const rateRemaining = remainingHeader === null ? null : Number(remainingHeader);
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = retryAfter ? retryAfter * 1000 : reset ? Math.max(1000, reset * 1000 - Date.now()) : 60_000;
    // Secondary limits and an exhausted primary limit: wait and retry this step.
    if (remainingHeader === "0" || res.status === 429 || retryAfter) {
      throw new RetryableError("github rate limited", { retryAfter: waitMs });
    }
  }
  if (opts.emptyOn?.has(res.status) && opts.empty !== undefined) {
    return { data: opts.empty, hasNext: false, rateRemaining, status: res.status };
  }
  if (!res.ok) throw new Error(`github ${path.split("?")[0]} ${res.status}`);
  const link = res.headers.get("link") ?? "";
  return { data: (await res.json()) as T, hasNext: /rel="next"/.test(link), rateRemaining, status: res.status };
}


type Deployment = { id: number; environment: string; sha: string; ref: string; created_at: string; creator?: { login?: string } | null };
type DeploymentStatus = { state: string; environment_url?: string; target_url?: string; created_at: string };

/**
 * The repo sync itself, with a token in hand: shared by the inventory step above and by the
 * on-demand refresh an agent triggers after a push (src/lib/github-refresh.ts).
 */
export async function syncRepoWith(t: string, input: { userId: string; accountNodeId: string; repo: RepoRef }) {
  const { repo, userId } = input;
  const at = new Date().toISOString();
  const externalKey = `github:repo:${repo.id}`;
  const [prior] = await getDb().select({ id: schema.nodes.id, attributes: schema.nodes.attributes }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"), eq(schema.nodes.externalKey, externalKey))).limit(1);
  let priorHost = typeof prior?.attributes.productionHost === "string" ? prior.attributes.productionHost : null;
  if (prior && !priorHost) {
    const old = await getDb().select({ node: schema.nodes }).from(schema.edges)
      .innerJoin(schema.nodes, eq(schema.edges.toNodeId, schema.nodes.id))
      .where(and(eq(schema.edges.userId, userId), eq(schema.edges.fromNodeId, prior.id), eq(schema.edges.kind, "deploys")));
    priorHost = old.map(({ node }) => {
      const a = node.attributes;
      const url = typeof a.url === "string" ? a.url : null;
      const creator = typeof a.creator === "string" ? a.creator : null;
      return { environment: String(a.environment ?? ""), state: node.status, provider: providerOf(url, creator), at: node.lastActivityAt?.toISOString() ?? null };
    }).filter((d) => d.environment.toLowerCase() === "production" && d.state === "success" && d.provider && d.provider !== "Vercel" && d.provider !== "GitHub Actions")
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0]?.provider ?? null;
  }
  const attributes: Record<string, unknown> = { ...prior?.attributes, url: repo.htmlUrl, private: repo.private, default_branch: repo.defaultBranch, language: repo.language };
  if (priorHost && priorHost !== "Vercel" && !attributes.productionHost) attributes.productionHost = priorHost;

  const repoNodeId = await upsertNode({
    userId,
    kind: "repo",
    externalKey,
    name: repo.fullName,
    attributes,
    status: repo.archived ? "archived" : "active",
    lastActivityAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
  });
  await upsertEdge({
    userId,
    fromNodeId: input.accountNodeId,
    toNodeId: repoNodeId,
    kind: "owns",
    confidence: 1,
    provenance: { source: "github", call: "GET /installation/repositories", at },
  });

  // First page only (newest 100). Enough to find the live environments.
  const [owner, name] = repo.fullName.split("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const call = `GET /repos/${owner}/${name}/deployments`;
  const list = await gh<Deployment[]>(t, `${base}/deployments?per_page=100`, { emptyOn: EMPTY_STATUSES, empty: [] });
  let rateRemaining = list.rateRemaining;
  const latestByEnv = new Map<string, Deployment>();
  const observedProduction: ProductionDeployment[] = [];
  for (const d of list.data) {
    const cur = latestByEnv.get(d.environment);
    if (!cur || d.created_at > cur.created_at) latestByEnv.set(d.environment, d);
  }

  for (const d of latestByEnv.values()) {
    const st = await gh<DeploymentStatus[]>(t, `${base}/deployments/${d.id}/statuses?per_page=1`, {
      emptyOn: EMPTY_STATUSES,
      empty: [],
    });
    rateRemaining = st.rateRemaining ?? rateRemaining;
    const s = st.data[0];
    if (d.environment.toLowerCase() === "production") observedProduction.push({ environment: d.environment, state: s?.state ?? null, provider: providerOf(s?.environment_url || s?.target_url || null, d.creator?.login ?? null), at: s?.created_at ?? d.created_at });
    const depNodeId = await upsertNode({
      userId,
      kind: "deployment",
      externalKey: `github:deployment:${repo.id}:${d.environment}`,
      name: `${repo.fullName} (${d.environment})`,
      attributes: {
        environment: d.environment,
        url: s?.environment_url || s?.target_url || null,
        sha: d.sha,
        ref: d.ref,
        deployment_id: d.id,
        // Who created the deployment on GitHub: a host's bot (vercel[bot], netlify[bot]) names the host even behind a custom domain.
        creator: d.creator?.login ?? null,
        state: s?.state ?? null,
      },
      status: s?.state ?? null,
      lastActivityAt: new Date(s?.created_at ?? d.created_at),
    });
    await upsertEdge({
      userId,
      fromNodeId: repoNodeId,
      toNodeId: depNodeId,
      kind: "deploys",
      confidence: 1,
      provenance: { source: "github", call, at },
    });
  }
  await recordProductionMove({ userId, nodeId: repoNodeId, attributes, deployments: observedProduction });
  const actions = await syncActionsWith(t, { userId, repoNodeId, repo, call });
  rateRemaining = actions.rateRemaining ?? rateRemaining;
  return { environments: latestByEnv.size, rateRemaining };
}

/**
 * GitHub Actions: the newest run of each workflow on the default branch becomes a deployment
 * node (creator github-actions), so a failed deploy workflow shows on Today, in incidents and
 * in the alert email like any other failed deploy. A failed run also carries the failing job,
 * step and the tail of that job's log. Without the Actions: read permission the API answers
 * 403 and the repo is marked so the Connections page can ask for the permission.
 */
export async function syncActionsWith(t: string, input: { userId: string; repoNodeId: string; repo: RepoRef; call: string }) {
  const { userId, repo } = input;
  const [owner, name] = repo.fullName.split("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const at = new Date().toISOString();
  let rateRemaining: number | null = null;
  let runsRes: GhResult<{ workflow_runs: WorkflowRun[] }>;
  try {
    runsRes = await gh<{ workflow_runs: WorkflowRun[] }>(t, `${base}/actions/runs?per_page=30&exclude_pull_requests=true`, { emptyOn: new Set([404, 409]), empty: { workflow_runs: [] } });
  } catch (err) {
    // 403: the install has not approved Actions: read. Remember that, say nothing else.
    if (/ 403$/.test((err as Error).message)) {
      await getDb().update(schema.nodes).set({ attributes: sqlMergeAttr({ actions_read: false }) }).where(eq(schema.nodes.id, input.repoNodeId));
      return { runs: 0, rateRemaining: null };
    }
    throw err;
  }
  rateRemaining = runsRes.rateRemaining;
  const latest = latestRunPerWorkflow(runsRes.data.workflow_runs, repo.defaultBranch);
  for (const run of latest) {
    const state = stateOfRun(run);
    const externalKey = `github:workflow:${repo.id}:${run.path}`;
    const label = run.name ?? run.path.split("/").pop() ?? "workflow";
    let logFacts: Record<string, unknown> = {};
    if (state === "failure") {
      const [prior] = await getDb().select({ attributes: schema.nodes.attributes }).from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"), eq(schema.nodes.externalKey, externalKey))).limit(1);
      const p = prior?.attributes as Record<string, unknown> | undefined;
      if (p && p.run_id === run.id && Array.isArray(p.log_tail)) {
        logFacts = { log_tail: p.log_tail, cause: p.cause ?? null, failed_job: p.failed_job ?? null, failed_step: p.failed_step ?? null, log_read_at: p.log_read_at ?? at };
      } else {
        logFacts = await readFailure(t, base, run, at);
        rateRemaining = (logFacts.rate_remaining as number | null) ?? rateRemaining;
        delete logFacts.rate_remaining;
        const fresh = Date.now() - Date.parse(run.updated_at) < 24 * 60 * 60 * 1000;
        if (fresh) {
          await notifyDeployFailed(userId, {
            deploymentId: `gha-${run.id}`,
            project: repo.fullName,
            environment: looksLikeDeploy(run) ? "production" : "preview",
            host: `GitHub Actions (${label})`,
            at: run.updated_at,
            cause: (logFacts.cause as string | null) ?? null,
            logTail: (logFacts.log_tail as string[]) ?? [],
            inspectorUrl: run.html_url,
            url: null,
          });
        }
      }
    }
    const depNodeId = await upsertNode({
      userId,
      kind: "deployment",
      externalKey,
      name: `${repo.fullName} (${label})`,
      attributes: {
        environment: label,
        workflow: true,
        deploy_workflow: looksLikeDeploy(run),
        workflow_path: run.path,
        url: null,
        state,
        conclusion: run.conclusion,
        creator: "github-actions",
        provider: "GitHub Actions",
        run_id: run.id,
        event: run.event,
        inspector_url: run.html_url,
        commit_sha: run.head_sha,
        commit_ref: run.head_branch,
        commit_message: run.head_commit?.message ? run.head_commit.message.split("\n")[0].slice(0, 120) : null,
        ...logFacts,
      },
      status: state,
      lastActivityAt: new Date(run.updated_at || run.created_at),
    });
    await upsertEdge({ userId, fromNodeId: input.repoNodeId, toNodeId: depNodeId, kind: "deploys", confidence: 1, provenance: { source: "github", call: `GET ${owner}/${name}/actions/runs`, at } });
  }
  await getDb().update(schema.nodes).set({ attributes: sqlMergeAttr({ actions_read: true }) }).where(eq(schema.nodes.id, input.repoNodeId));
  return { runs: latest.length, rateRemaining };
}

/** The failing job, its failing step and the tail of its log. Two calls, bounded. */
async function readFailure(t: string, base: string, run: WorkflowRun, at: string): Promise<Record<string, unknown>> {
  try {
    const jobs = await gh<{ jobs: WorkflowJob[] }>(t, `${base}/actions/runs/${run.id}/jobs?per_page=50`, { emptyOn: new Set([404]), empty: { jobs: [] } });
    const f = failingStep(jobs.data.jobs);
    if (!f) return { log_tail: [], cause: null, failed_job: null, failed_step: null, log_read_at: at, rate_remaining: jobs.rateRemaining };
    // The logs endpoint redirects to a short-lived URL; fetch follows it. Read at most the last 64 KB.
    const res = await fetch(`${GITHUB_API}${base}/actions/jobs/${f.job.id}/logs`, { headers: githubHeaders(t), redirect: "follow" });
    const text = res.ok ? await res.text() : "";
    const { tail, cause } = actionsTailAndCause(text, f.step);
    return { log_tail: tail, cause, failed_job: f.job.name, failed_step: f.step, log_read_at: at, rate_remaining: jobs.rateRemaining };
  } catch (err) {
    if (err instanceof RetryableError) throw err;
    return { log_tail: [], cause: null, failed_job: null, failed_step: null, log_read_at: at, rate_remaining: null };
  }
}

/** attributes = attributes || patch, in SQL, so one flag can change without rewriting the node. */
function sqlMergeAttr(patch: Record<string, unknown>) {
  return sql`${schema.nodes.attributes} || ${JSON.stringify(patch)}::jsonb`;
}
