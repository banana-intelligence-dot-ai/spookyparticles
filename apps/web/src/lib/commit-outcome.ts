import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { catchesFor, type Catch } from "./catches";

/**
 * The map keeps only a project's current deploys, so each production deploy the sync sees is also
 * kept as one small event. That is how "did my commit reach production" still answers a day later.
 */
export const DEPLOY_SEEN = "deploy.seen";
type Seen = { id: string; state: string | null; createdAt: string | null; sha: string | null };

/** Pure: event rows for production deploys not already recorded. Only finished ones, with a commit. */
export function deploySeenRows(userId: string, repo: string, deploys: Seen[], known: Set<string>) {
  return deploys
    .filter((d) => d.sha && d.createdAt && (d.state === "READY" || d.state === "ERROR") && !known.has(`vercel:${d.id}`))
    .map((d) => ({ userId, name: DEPLOY_SEEN, properties: { key: `vercel:${d.id}`, repo: repo.toLowerCase(), sha: d.sha, at: d.createdAt, state: d.state === "READY" ? "success" : "failure", environment: "production" } }));
}

/** Called by the Vercel sync. Never fails the sync: a missed row only makes an answer less complete. */
export async function recordProductionDeploys(userId: string, repo: string, deploys: Seen[]): Promise<void> {
  try {
    const keys = deploys.map((d) => `vercel:${d.id}`);
    if (!keys.length) return;
    const db = getDb();
    const existing = await db.select({ key: sql<string>`${schema.events.properties}->>'key'` }).from(schema.events)
      .where(and(eq(schema.events.userId, userId), eq(schema.events.name, DEPLOY_SEEN), inArray(sql<string>`${schema.events.properties}->>'key'`, keys)));
    const rows = deploySeenRows(userId, repo, deploys, new Set(existing.map((e) => e.key)));
    if (rows.length) await db.insert(schema.events).values(rows);
  } catch (err) {
    console.warn("[commit-outcome] could not record deploys", (err as Error).message);
  }
}

type Deployment = { environment: string; sha: string | null; state: string | null; at: string | null };
type Break = Pick<Catch, "project" | "kind" | "what" | "caughtAt" | "fixedAt" | "fixedBy"> & { commitSha?: string | null };
export type CommitOutcome = { sha: string; deployed: boolean | null; broke: { what: string; at: string }[]; fixed: { at: string; by: string | null } | null; minutesToFix: number | null };

const matches = (a: string | null | undefined, b: string) => Boolean(a && (a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase())));
const isRepo = (project: string | null, repo: string) => Boolean(project && (project.toLowerCase() === repo.toLowerCase() || !project.includes("/") && project.toLowerCase() === repo.split("/")[1].toLowerCase()));

/** Summarize only deployment and break facts already observed for this repo. */
export function commitOutcome(sha: string, deployments: Deployment[], catches: Break[], repo: string): CommitOutcome {
  const matched = deployments.filter((d) => matches(d.sha, sha));
  const live = matched.filter((d) => d.environment.toLowerCase() === "production" && d.state === "success" && d.at)
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))[0];
  const next = live ? deployments.filter((d) => d.environment.toLowerCase() === "production" && d.at && d.at > (live.at ?? "") && !matches(d.sha, sha))
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))[0]?.at : null;
  const breaks = catches.filter((c) => isRepo(c.project, repo) && c.kind !== "check" &&
    (c.kind === "deploy" && matches(c.commitSha, sha) || Boolean(live?.at && c.caughtAt >= live.at && (!next || c.caughtAt < next))));
  const fixed = breaks.length && breaks.every((c) => c.fixedAt)
    ? breaks.reduce((last, c) => !last || (c.fixedAt ?? "") > (last.fixedAt ?? "") ? c : last, null as Break | null)
    : null;
  const first = breaks.reduce((at, c) => !at || c.caughtAt < at ? c.caughtAt : at, "");
  return {
    sha,
    deployed: live ? true : matched.length || breaks.some((c) => c.kind === "deploy" && matches(c.commitSha, sha)) ? false : null,
    broke: breaks.map((c) => ({ what: c.what, at: c.caughtAt })),
    fixed: fixed?.fixedAt ? { at: fixed.fixedAt, by: fixed.fixedBy?.kind === "commit" ? fixed.fixedBy.sha : null } : null,
    minutesToFix: fixed?.fixedAt && first ? Math.round((Date.parse(fixed.fixedAt) - Date.parse(first)) / 60_000) : null,
  };
}

/** Read only: every query is scoped to the actor's account. */
export async function commitOutcomeFor(userId: string, repo: string, sha: string): Promise<CommitOutcome> {
  const db = getDb();
  const [root] = await db.select({ id: schema.nodes.id }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"), eq(sql<string>`lower(${schema.nodes.name})`, repo.toLowerCase()))).limit(1);
  if (!root) return commitOutcome(sha, [], [], repo);
  const links = await db.select({ id: schema.edges.toNodeId }).from(schema.edges)
    .where(and(eq(schema.edges.userId, userId), eq(schema.edges.fromNodeId, root.id), eq(schema.edges.kind, "deploys")));
  const ids = links.map((link) => link.id);
  const rows = ids.length ? await db.select({ name: schema.nodes.name, attributes: schema.nodes.attributes, status: schema.nodes.status, at: schema.nodes.lastActivityAt }).from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"), inArray(schema.nodes.id, ids))) : [];
  const seen = await db.select({ properties: schema.events.properties }).from(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.name, DEPLOY_SEEN), eq(sql<string>`${schema.events.properties}->>'repo'`, repo.toLowerCase())))
    .limit(500);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const deployments = [
    ...rows.map((row): Deployment => {
      const a = row.attributes;
      return { environment: typeof a.environment === "string" ? a.environment : "", sha: typeof a.commit_sha === "string" ? a.commit_sha : typeof a.sha === "string" ? a.sha : null, state: row.status, at: row.at?.toISOString() ?? null };
    }),
    ...seen.map(({ properties: p }): Deployment => ({ environment: str(p.environment) ?? "", sha: str(p.sha), state: str(p.state), at: str(p.at) })),
  ];
  const history = await catchesFor(userId, { record: false });
  const currentFailures: Break[] = rows.flatMap((row) => {
    const a = row.attributes;
    const commitSha = typeof a.commit_sha === "string" ? a.commit_sha : typeof a.sha === "string" ? a.sha : null;
    const at = row.at?.toISOString();
    if (!at || !commitSha || !["error", "failure", "failed"].includes(row.status ?? "")) return [];
    if (history.catches.some((c) => c.kind === "deploy" && c.caughtAt === at && isRepo(c.project, repo))) return [];
    return [{ kind: "deploy", project: repo, what: typeof a.cause === "string" ? `Deploy failed: ${a.cause}` : "Deploy failed", caughtAt: at, fixedAt: null, fixedBy: null, commitSha }];
  });
  return commitOutcome(sha, deployments, [...history.catches, ...currentFailures], repo);
}
