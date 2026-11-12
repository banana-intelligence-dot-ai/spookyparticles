/**
 * Steps for the GitHub inventory, read through the GitHub App installation:
 * GET /installation/repositories for the repos the user picked, then per repo
 * the Deployments API (latest deployment per environment and its URL). Writes
 * repo and deployment nodes, an owning provider_account node, and `owns` /
 * `deploys` edges with provenance.
 *
 * Every step mints (or reuses from memory) an installation token by connection
 * id. Tokens never cross a step boundary and are never stored.
 */
import { eq } from "drizzle-orm";
import { FatalError, RetryableError } from "workflow";
import { getDb, schema } from "@/db";
import { getConnection, getInstallationToken, installationProblem } from "@/lib/connections";
import { gh, syncRepoWith, type RepoRef } from "@/lib/github-sync";
import { upsertNode } from "@/lib/graph";
import { getInstallation, permissionNames, type InstallationRepo } from "@/lib/providers/github-app";

export type { RepoRef } from "@/lib/github-sync";

/** Installation token for this step. A removed or suspended install stops the run for good. */
async function token(connectionId: string): Promise<string> {
  try {
    return await getInstallationToken(connectionId);
  } catch (err) {
    const reason = installationProblem(err);
    if (reason) throw new FatalError(reason);
    if ((err as Error).message === "connection is not active") throw new FatalError("Connection is not active");
    throw err;
  }
}

export async function ensureAccountNode(connectionId: string) {
  "use step";
  const c = await getConnection(connectionId);
  if (!c) throw new FatalError("connection not found");
  let inst;
  try {
    inst = await getInstallation(c.externalAccountId);
  } catch (err) {
    const reason = installationProblem(err);
    if (reason) throw new FatalError(reason);
    throw err;
  }
  const account = inst.account;
  // Permissions can grow after install (Actions: read was added Nov 2026); keep the row current.
  const scopes = permissionNames(inst.permissions);
  if (scopes.length && scopes.join(",") !== c.scopes.join(",")) {
    await getDb().update(schema.connections).set({ scopes }).where(eq(schema.connections.id, c.id));
  }
  const nodeId = await upsertNode({
    userId: c.userId,
    kind: "provider_account",
    // Keyed by the GitHub account id, so the node survives a login rename or a reinstall.
    externalKey: `github:account:${account?.id ?? `installation-${inst.id}`}`,
    name: c.display,
    attributes: {
      provider: "github",
      login: c.display,
      account_type: account?.type ?? null,
      installation_id: inst.id,
      repository_selection: inst.repository_selection,
      connection_id: c.id,
    },
    status: inst.suspended_at ? "suspended" : "active",
  });
  return { userId: c.userId, accountNodeId: nodeId };
}

/**
 * Every repo the installation can see, sorted by id so a paused run can resume
 * after the last repo it finished. At most maxPages pages of 100.
 */
export async function listRepos(connectionId: string, maxPages: number) {
  "use step";
  const t = await token(connectionId);
  const repos: RepoRef[] = [];
  let rateRemaining: number | null = null;
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const r = await gh<{ total_count: number; repositories: InstallationRepo[] }>(
      t,
      `/installation/repositories?per_page=100&page=${page}`,
    );
    rateRemaining = r.rateRemaining;
    for (const x of r.data.repositories) {
      repos.push({
        id: x.id,
        fullName: x.full_name,
        private: x.private,
        archived: x.archived,
        htmlUrl: x.html_url,
        pushedAt: x.pushed_at,
        defaultBranch: x.default_branch,
        language: x.language ?? null,
      });
    }
    if (!r.hasNext) break;
    if (page === maxPages) truncated = true;
  }
  repos.sort((a, b) => a.id - b.id);
  return { repos, rateRemaining, truncated };
}

type Deployment = { id: number; environment: string; sha: string; ref: string; created_at: string; creator?: { login?: string } | null };
type DeploymentStatus = { state: string; environment_url?: string; target_url?: string; created_at: string };

/** One repo: node, then the latest deployment per environment with its URL. */
export async function syncRepo(input: { connectionId: string; userId: string; accountNodeId: string; repo: RepoRef }) {
  "use step";
  const t = await token(input.connectionId);
  return syncRepoWith(t, input);
}

export async function markGithubSynced(connectionId: string, syncRunId: string, repos: number) {
  "use step";
  const now = new Date();
  await getDb().update(schema.connections).set({ lastSyncedAt: now }).where(eq(schema.connections.id, connectionId));
  await getDb()
    .update(schema.syncRuns)
    .set({ phase: "done", scanned: repos, cursor: null, finishedAt: now, updatedAt: now })
    .where(eq(schema.syncRuns.id, syncRunId));
}

/** Stop early at a low rate limit. The next sync resumes after `cursor` (a repo id). */
export async function pauseGithubRun(syncRunId: string, repos: number, cursor: string | null) {
  "use step";
  const now = new Date();
  await getDb()
    .update(schema.syncRuns)
    .set({
      scanned: repos,
      cursor,
      error: "Paused at the GitHub rate limit. The next sync continues from here.",
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.syncRuns.id, syncRunId));
}

export async function setGithubProgress(syncRunId: string, repos: number) {
  "use step";
  await getDb()
    .update(schema.syncRuns)
    .set({ scanned: repos, updatedAt: new Date() })
    .where(eq(schema.syncRuns.id, syncRunId));
}

// Rate limits and transient errors are expected on large accounts.
listRepos.maxRetries = 6;
syncRepo.maxRetries = 6;
