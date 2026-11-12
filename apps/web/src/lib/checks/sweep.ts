import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getInstallationToken } from "@/lib/connections";
import { gh } from "@/lib/github-sync";
import { siteTargets } from "@/lib/vercel-monitor";
import { expirations } from "@/lib/expirations/expirations";
import { notifyExpiration } from "@/lib/alerts/expiration";
import { scanPublicSite } from "./public-scan";
import { DEPENDENCY_FILES, depsRule, type Decision } from "./rules";
import { readChecks, saveCheck } from "./store";

const DAY = 86_400_000;
/** Repos read on GitHub per watcher run. Each costs two requests, and the work is spread over runs. */
const MAX_REPO_READS = 10;
export async function sweepChecks(now = new Date()): Promise<{ scanned: number; repos: number; ready: boolean }> {
  const db = getDb();
  const [projects, domains, links, repos, accounts, connections] = await Promise.all([
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "project")),
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "domain")),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId, kind: schema.edges.kind }).from(schema.edges),
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "repo")),
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "provider_account")),
    db.select().from(schema.connections).where(eq(schema.connections.provider, "github")),
  ]);
  for (const node of [...projects, ...domains]) {
    for (const item of expirations([node], now)) await notifyExpiration(node.userId, item, node.id);
  }
  const byUser = new Map<string, Awaited<ReturnType<typeof readChecks>>>();
  for (const p of projects) if (!byUser.has(p.userId)) byUser.set(p.userId, await readChecks(p.userId));
  if ([...byUser.values()].some((x) => !x.ready)) return { scanned: 0, repos: 0, ready: false };
  const prior = (p: typeof projects[number], check: string) => byUser.get(p.userId)?.rows.find((r) => r.nodeId === p.id && r.check === check);
  const dueSite = siteTargets(projects, domains, links).filter(({ p }) => {
    const row = prior(p, "secret_in_public_code");
    if (row?.evidence.kind === "name" && row.state === "open") return false;
    const deploymentId = typeof p.attributes.production_deployment_id === "string" ? p.attributes.production_deployment_id : null;
    if (!row) return true;
    const age = now.getTime() - row.checkedAt.getTime();
    // A scan that could not finish may have hit a passing fault. Try again after a day, not a week.
    return row.evidence.deploymentId !== deploymentId || age >= 7 * DAY || (row.state === "unknown" && age >= DAY);
  }).sort((a, b) => (prior(a.p, "secret_in_public_code")?.checkedAt.getTime() ?? 0) - (prior(b.p, "secret_in_public_code")?.checkedAt.getTime() ?? 0)).slice(0, 5);
  for (const { p, url, knownHosts } of dueSite) {
    const result = await scanPublicSite(url, knownHosts);
    const deploymentId = typeof p.attributes.production_deployment_id === "string" ? p.attributes.production_deployment_id : null;
    const existingName = prior(p, "secret_in_public_code");
    const nameHit = existingName?.evidence.kind === "name" && existingName.state === "open";
    const decision: Decision = nameHit ? { state: "open", reason: null, evidence: existingName.evidence } : {
      state: result.state, reason: result.reason, evidence: { ...(result.hits[0] ?? {}), hits: result.hits, deploymentId },
    };
    await saveCheck(p.userId, p.id, "secret_in_public_code", decision, now);
  }
  let repoCount = 0;
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const repoDecisions = new Map<string, Decision>();
  for (const p of projects.filter((x) => x.externalKey.startsWith("vercel:project:"))) {
    const old = prior(p, "deps_not_updated");
    if (old && now.getTime() - old.checkedAt.getTime() < DAY) continue;
    const edge = links.find((e) => e.toNodeId === p.id && e.kind === "hosted_on");
    const repo = edge ? repoById.get(edge.fromNodeId) : null;
    let decision: Decision;
    if (!p.attributes.repo) decision = depsRule({ linked: false });
    else if (!repo) decision = depsRule({ linked: true, covered: false });
    else if (repoDecisions.has(repo.id)) decision = repoDecisions.get(repo.id)!;
    else if (repo.attributes.private === true) decision = depsRule({ linked: true, covered: true, private: true });
    else if (repo.attributes.private !== false) decision = depsRule({ linked: true, covered: true, failed: true });
    else if (repoCount >= MAX_REPO_READS) continue; // The rest wait for the next run.
    else {
      const connectionId = links.filter((e) => e.toNodeId === repo.id && e.kind === "owns").map((e) => accountById.get(e.fromNodeId)).find(Boolean)?.attributes.connection_id;
      const connection = connections.find((c) => c.id === connectionId && c.status === "active" && c.userId === p.userId);
      if (!connection) decision = depsRule({ linked: true, covered: false });
      else {
        const fullName = repo.name.split("/");
        try {
          const token = await getInstallationToken(connection.id);
          // Positive control first: the root listing must come back. A file is "absent" only when we
          // have seen the folder it would be in, so a refusal can never read as a finding.
          const base = `/repos/${encodeURIComponent(fullName[0])}/${encodeURIComponent(fullName[1])}/contents`;
          const names = (list: unknown, prefix: string) => (Array.isArray(list) ? list : []).map((x) => (x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? prefix + (x as { name: string }).name : "")).filter(Boolean);
          const root = await gh<unknown>(token, `${base}/`);
          if (!Array.isArray(root.data)) throw new Error("root listing was not a list");
          const seen = names(root.data, "");
          if (seen.includes(".github")) seen.push(...names((await gh<unknown>(token, `${base}/.github`, { emptyOn: new Set([404]), empty: [] })).data, ".github/"));
          const found = DEPENDENCY_FILES.filter((path) => seen.includes(path));
          decision = depsRule({ linked: true, covered: true, files: found });
          repoCount++;
        } catch { decision = depsRule({ linked: true, covered: true, failed: true }); }
      }
    }
    if (repo) repoDecisions.set(repo.id, decision);
    await saveCheck(p.userId, p.id, "deps_not_updated", decision, now);
  }
  return { scanned: dueSite.length, repos: repoCount, ready: true };
}
