import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pushNoDeploy, type PushFinding } from "./push-no-deploy";

export type LinkedPushFinding = PushFinding & { project: string; branch: string; message: string | null };

/** Read the linked Vercel project's recent deployment snapshot, regardless of environment or state. */
export async function pushNoDeployFor(userId: string, nowMs = Date.now()): Promise<LinkedPushFinding[]> {
  const db = getDb();
  const [repos, projects, links] = await Promise.all([
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"))),
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project"))),
    db.select({ from: schema.edges.fromNodeId, to: schema.edges.toNodeId }).from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "hosted_on"))),
  ]);
  const vercel = new Map(projects.filter((p) => p.attributes.provider === "vercel").map((p) => [p.id, p]));
  // A repo can feed several Vercel projects (a monorepo): the commit counts as deployed if any of them built it.
  const projectsByRepo = new Map<string, (typeof projects)[number][]>();
  for (const e of links) if (vercel.has(e.to)) projectsByRepo.set(e.from, [...(projectsByRepo.get(e.from) ?? []), vercel.get(e.to)!]);
  return repos.flatMap((repo): LinkedPushFinding[] => {
    const linked = projectsByRepo.get(repo.id) ?? [];
    const a = repo.attributes;
    const head = typeof a.head_sha === "string" && typeof a.head_at === "string" ? { sha: a.head_sha, at: a.head_at } : null;
    const read = linked.filter((p) => Array.isArray(p.attributes.recent_deployments));
    const raw = read.flatMap((p) => p.attributes.recent_deployments as { sha?: unknown; at?: unknown }[]);
    const deployments = raw.filter((d): d is { sha: string | null; at: string | null } => Boolean(d) && typeof d === "object" && (d.sha === null || typeof d.sha === "string") && (d.at === null || typeof d.at === "string"));
    const branchMatches = read.some((p) => typeof p.attributes.production_branch !== "string" || p.attributes.production_branch === a.default_branch);
    const finding = pushNoDeploy({ head, linkedToVercel: read.length > 0 && branchMatches, archived: repo.status === "archived", deployments, nowMs });
    return finding ? [{ ...finding, project: repo.name, branch: typeof a.default_branch === "string" ? a.default_branch : "default branch", message: typeof a.head_message === "string" ? a.head_message : null }] : [];
  });
}
