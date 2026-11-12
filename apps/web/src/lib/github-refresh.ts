/**
 * Refresh one repo from GitHub right now: its push time, archived state and latest
 * deployment per environment. An agent that just pushed calls /api/v1/incidents?project=
 * and expects that push to be visible; the 10-minute inventory cadence is too slow for
 * that. Three to five API calls per refresh, at most once a minute per repo.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getInstallationToken } from "@/lib/connections";
import { GITHUB_API, githubHeaders, type InstallationRepo } from "@/lib/providers/github-app";
import { syncRepoWith } from "@/lib/github-sync";

const MIN_GAP_MS = 60_000;
const lastRefresh = new Map<string, number>();

/** The repo node, the account that owns it and the connection behind that account. Null when the map has none. */
async function locate(userId: string, fullName: string) {
  const db = getDb();
  const [repo] = await db
    .select({ id: schema.nodes.id, name: schema.nodes.name })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"), eq(schema.nodes.name, fullName)))
    .limit(1);
  if (!repo) return null;
  const [edge] = await db
    .select({ fromNodeId: schema.edges.fromNodeId })
    .from(schema.edges)
    .where(and(eq(schema.edges.userId, userId), eq(schema.edges.toNodeId, repo.id), eq(schema.edges.kind, "owns")))
    .limit(1);
  if (!edge) return null;
  const [account] = await db.select({ id: schema.nodes.id, attributes: schema.nodes.attributes }).from(schema.nodes).where(eq(schema.nodes.id, edge.fromNodeId)).limit(1);
  const connectionId = (account?.attributes as Record<string, unknown> | undefined)?.connection_id;
  if (!account || typeof connectionId !== "string") return null;
  return { repo, accountNodeId: account.id, connectionId };
}

/**
 * Re-read one repo. Resolves `name` as "owner/repo" or a bare repo name the user has once.
 * Quiet: any failure is logged, never raised, and never blocks the read that asked for it.
 */
export async function refreshRepoQuietly(userId: string, name: string): Promise<"refreshed" | "skipped" | "unknown"> {
  const key = `${userId}:${name.toLowerCase()}`;
  const now = Date.now();
  if (now - (lastRefresh.get(key) ?? 0) < MIN_GAP_MS) return "skipped";
  lastRefresh.set(key, now);
  try {
    const fullName = name.includes("/") ? name : await fullNameFor(userId, name);
    if (!fullName) return "unknown";
    const found = await locate(userId, fullName);
    if (!found) return "unknown";
    const token = await getInstallationToken(found.connectionId);
    const [owner, repoName] = fullName.split("/");
    const res = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`, { headers: githubHeaders(token) });
    if (!res.ok) return "unknown";
    const r = (await res.json()) as InstallationRepo & { language?: string | null };
    await syncRepoWith(token, {
      userId,
      accountNodeId: found.accountNodeId,
      repo: { id: r.id, fullName: r.full_name, private: r.private, archived: r.archived, htmlUrl: r.html_url, pushedAt: r.pushed_at, defaultBranch: r.default_branch, language: r.language ?? null },
    });
    return "refreshed";
  } catch (err) {
    console.warn("[refresh] repo", name, (err as Error).message);
    return "unknown";
  }
}

/** "plainballot" to "n8peace/plainballot" when exactly one repo of the user ends with that name. */
async function fullNameFor(userId: string, short: string): Promise<string | null> {
  const rows = await getDb()
    .select({ name: schema.nodes.name })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo")));
  const hits = rows.filter((r) => r.name.toLowerCase().endsWith(`/${short.toLowerCase()}`));
  return hits.length === 1 ? hits[0].name : null;
}
