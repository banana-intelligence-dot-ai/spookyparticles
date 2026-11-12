/** Five minute external checks for production sites and request-history error rates. */
import { isIP } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deliverToAll } from "@/lib/alerts/channels";
import { getAccessToken } from "@/lib/connections";
import { appUrl } from "@/lib/env";
import { pinnedGet, resolvePublic } from "@/lib/net-safety";
import type { VercelScope } from "@/lib/providers/vercel";
import { queryErrorRate } from "@/lib/providers/vercel-query";
import { nextErrorRate, nextUptime, type ErrorRateState, type UptimeState } from "@/lib/vercel-health";
import { historyChoice } from "@/lib/vercel-watch";

type ProjectNode = typeof schema.nodes.$inferSelect;
const unreadableUntil = new Map<string, number>();
const attrs = (p: ProjectNode) => p.attributes as Record<string, unknown>;
const priorError = (p: ProjectNode): ErrorRateState | null => {
  const v = attrs(p).errorRate;
  return v && typeof v === "object" && "incidentAt" in v && "recoveryWindows" in v ? v as ErrorRateState : null;
};
const priorUptime = (p: ProjectNode): UptimeState | null => {
  const v = attrs(p).uptime;
  return v && typeof v === "object" && "state" in v && "lastCheckedAt" in v ? v as UptimeState : null;
};

async function notify(userId: string, kind: "server_errors" | "server_errors_recovered" | "site_down" | "site_recovered", key: string, project: string, subject: string, text: string) {
  const db = getDb();
  const [person] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  const [row] = await db.insert(schema.alerts).values({ userId, kind, key, channel: "channels", to: person?.email ?? "", subject, payload: { project } })
    .onConflictDoNothing({ target: [schema.alerts.userId, schema.alerts.key] }).returning({ id: schema.alerts.id });
  if (!row) return false;
  const results = await deliverToAll(userId, { subject, text, link: new URL("/app", appUrl()).toString(), priority: kind === "site_down" || kind === "server_errors" ? "high" : "default" }, project);
  const anyOk = results.some((r) => r.ok);
  await db.update(schema.alerts).set({ sentAt: anyOk ? new Date() : null, error: anyOk ? null : (results.map((r) => `${r.kind}: ${r.reason ?? "failed"}`).join("; ") || "no channel").slice(0, 200), payload: sql`${schema.alerts.payload} || ${JSON.stringify({ deliveries: results })}::jsonb` }).where(eq(schema.alerts.id, row.id));
  return true;
}

async function save(p: ProjectNode, field: "errorRate" | "uptime", state: ErrorRateState | UptimeState) {
  await getDb().update(schema.nodes).set({ attributes: sql`${schema.nodes.attributes} || ${JSON.stringify({ [field]: state })}::jsonb` })
    .where(and(eq(schema.nodes.id, p.id), eq(schema.nodes.userId, p.userId)));
}

export async function sweepServerErrors(nowMs = Date.now()): Promise<{ queried: number; alerts: number; unavailable: number }> {
  const db = getDb();
  const [projects, connections, jobs] = await Promise.all([
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "project")),
    db.select().from(schema.connections).where(and(eq(schema.connections.provider, "vercel"), eq(schema.connections.status, "active"))),
    db.select({ userId: schema.checkinJobs.userId, vercelProjectId: schema.checkinJobs.vercelProjectId, vercelConnectionId: schema.checkinJobs.vercelConnectionId, evidenceState: schema.checkinJobs.evidenceState }).from(schema.checkinJobs).where(eq(schema.checkinJobs.source, "vercel")),
  ]);
  let queried = 0, alerts = 0, unavailable = 0;
  for (const p of projects) {
    if (!p.externalKey.startsWith("vercel:project:")) continue;
    const a = attrs(p);
    const candidates = connections.filter((c) => c.userId === p.userId);
    const projectId = p.externalKey.slice("vercel:project:".length);
    const proven = jobs.find((j) => j.userId === p.userId && j.vercelProjectId === projectId && j.evidenceState === "ok" && candidates.some((c) => c.id === j.vercelConnectionId))?.vercelConnectionId;
    const recorded = typeof a.connection_id === "string" && candidates.some((c) => c.id === a.connection_id) ? a.connection_id : null;
    const current = proven ?? recorded ?? candidates[0]?.id;
    if (!current || (unreadableUntil.get(p.id) ?? 0) > nowMs) continue;
    const choice = historyChoice(current, candidates, []);
    if (choice.kind !== "try") continue;
    const scopeId = typeof a.scope_id === "string" ? a.scope_id : "scoped";
    const scope: VercelScope = { kind: a.scope_kind === "user" ? "user" : "team", id: scopeId, slug: "", name: "" };
    let result: Awaited<ReturnType<typeof queryErrorRate>>;
    try { result = await queryErrorRate(await getAccessToken(choice.id), scope, projectId, nowMs - 15 * 60_000, nowMs); }
    catch { result = { ok: false, reason: "unavailable" }; }
    queried++;
    if (!result.ok) {
      unavailable++;
      if (result.reason === "not_readable") unreadableUntil.set(p.id, nowMs + 60 * 60_000);
      continue;
    }
    unreadableUntil.delete(p.id);
    const prior = priorError(p);
    const at = new Date(nowMs).toISOString();
    const next = nextErrorRate(prior, result.counts, at);
    await save(p, "errorRate", next.state);
    if (next.event) {
      const incident = next.event === "alert" ? next.state.incidentAt : prior?.incidentAt;
      const subject = next.event === "alert" ? `${p.name}: server errors on production` : `${p.name}: server errors cleared`;
      const text = next.event === "alert" ? `${result.counts.serverErrors} of ${result.counts.total} requests in the last 15 minutes answered with a server error (5xx).` : `${p.name}: server errors have cleared.`;
      if (await notify(p.userId, next.event === "alert" ? "server_errors" : "server_errors_recovered", `server_errors:${p.id}:${incident}:${next.event}`, p.name, subject, text)) alerts++;
    }
  }
  return { queried, alerts, unavailable };
}

/** A redirect is followed only if its hostname is another hostname Vercel recorded for this project. */
export async function checkSite(startUrl: string, knownHosts: Set<string>): Promise<{ kind: "up" | "down" | "protected" | "unknown"; status: string }> {
  let url: URL;
  try { url = new URL(startUrl); } catch { return { kind: "unknown", status: "invalid URL" }; }
  const deadline = Date.now() + 10_000;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (Date.now() >= deadline) return { kind: "down", status: "timeout" };
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.port && url.port !== "443" || url.username || url.password || isIP(host) || !knownHosts.has(host)) return { kind: "unknown", status: "unsafe destination" };
    let addresses: Awaited<ReturnType<typeof resolvePublic>>;
    try { addresses = await resolvePublic(host, deadline - Date.now()); }
    catch (err) { return (err as Error).message === "address not public" ? { kind: "unknown", status: "unsafe address" } : { kind: "down", status: (err as Error).message === "timeout" ? "timeout" : "DNS error" }; }
    let answer: Awaited<ReturnType<typeof pinnedGet>>;
    try { answer = await pinnedGet(url, addresses[0], deadline - Date.now(), { "user-agent": "SpookyParticles-Uptime/1.0 (+https://spookyparticles.com)" }); }
    catch (err) { return { kind: "down", status: (err as Error).message === "timeout" ? "timeout" : "network error" }; }
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      if (redirects === 5) return { kind: "down", status: "too many redirects" };
      try { url = new URL(answer.location, url); } catch { return { kind: "down", status: "invalid redirect" }; }
      continue;
    }
    if (answer.status >= 200 && answer.status < 400) return { kind: "up", status: String(answer.status) };
    if (answer.status === 401 || answer.status === 403) return { kind: "protected", status: String(answer.status) };
    return { kind: "down", status: String(answer.status) };
  }
  return { kind: "down", status: "too many redirects" };
}

export async function sweepUptime(nowMs = Date.now()): Promise<{ checked: number; alerts: number }> {
  const db = getDb();
  const [projects, domains, links] = await Promise.all([
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "project")),
    db.select().from(schema.nodes).where(eq(schema.nodes.kind, "domain")),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges).where(eq(schema.edges.kind, "points_to")),
  ]);
  const candidates = siteTargets(projects, domains, links).filter((x): x is { p: ProjectNode; url: string; knownHosts: Set<string> } => Boolean(x.url))
    .sort((x, y) => (priorUptime(x.p)?.lastCheckedAt ?? "").localeCompare(priorUptime(y.p)?.lastCheckedAt ?? ""))
    .slice(0, 40);
  let checked = 0, alerts = 0;
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = await Promise.all(candidates.slice(i, i + 5).map(async ({ p, url, knownHosts }) => {
      const result = await checkSite(url, knownHosts);
      const prior = priorUptime(p);
      const next = nextUptime(prior, result, new Date(nowMs).toISOString());
      await save(p, "uptime", next.state);
      let alerted = false;
      if (next.event === "alert") alerted = await notify(p.userId, "site_down", `site:${p.id}:${next.state.alertAt}:down`, p.name, `${p.name}: site is down`, `${url} answered ${result.status} twice in a row.`);
      if (next.event === "recovered") alerted = await notify(p.userId, "site_recovered", `site:${p.id}:${prior?.alertAt}:recovered`, p.name, `${p.name}: site is back`, `${url} is back (${result.status}).`);
      return alerted;
    }));
    checked += batch.length;
    alerts += batch.filter(Boolean).length;
  }
  return { checked, alerts };
}

/** Shared production address and host allow-list for uptime and public scans. */
export function siteTargets(projects: ProjectNode[], domains: ProjectNode[], links: { fromNodeId: string; toNodeId: string }[]) {
  const domainById = new Map(domains.map((d) => [d.id, d]));
  return projects.filter((p) => p.externalKey.startsWith("vercel:project:")).map((p) => {
    const a = attrs(p);
    const own = links.filter((e) => e.toNodeId === p.id).map((e) => domainById.get(e.fromNodeId)).filter((d): d is ProjectNode => Boolean(d) && d!.userId === p.userId);
    const custom = own.filter((d) => d.status === "verified" && !d.attributes.redirect_to).sort((x, y) => x.name.localeCompare(y.name))[0]?.name;
    const deployment = typeof a.production_url === "string" ? a.production_url : null;
    const url = custom ? `https://${custom}` : deployment;
    const knownHosts = new Set(own.map((d) => d.name.toLowerCase()));
    if (deployment) try { knownHosts.add(new URL(deployment).hostname.toLowerCase()); } catch { /* skip malformed sync value */ }
    return { p, url, knownHosts };
  });
}
