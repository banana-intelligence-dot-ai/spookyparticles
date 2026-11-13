/**
 * Projects: the "what is going on" view. One row per repo, joined with the
 * latest deployment per environment (GitHub), the subscriptions that pay for it
 * (receipts whose project names match), the notices mail brought in (failed
 * deploys, usage limits, renewals, security alerts), and its open findings.
 * Headless: the web app, CLI and MCP all read this shape.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { FindingKind, ReceiptKind } from "@/db/schema";
import { loadReceipts, publicFinding, spendFor, type LoadedReceipt } from "./findings";
import { billingUrl, linkSubscriptions, matchRepo, type RepoNode } from "./findings-rules";
import { providerFromCreator, providerOf } from "./hosts";
import { moveHome, productionHost } from "./move-home";
import { recordProductionMove } from "./move-home-record";
import { breakKey, ignoredKeys } from "./ignores";
import { buildProjectPage, type PageFinding, type ProjectPage } from "./project-page";
import type { SpendReport, Subscription, VendorScope } from "./spend";
import type { UptimeState } from "./vercel-health";

export { providerFromCreator, providerFromUrl, providerOf } from "./hosts";

export type DeploymentView = {
  environment: string;
  /** What to call it on screen: the environment, never a job or run id. */
  label: string;
  state: string | null;
  url: string | null;
  at: string | null;
  /** The host the deployment URL points at (Vercel, Netlify, Render, Fly.io, Railway, Cloudflare, GitHub Pages), when it is recognizable. */
  provider: string | null;
  /** The GitHub login that created the deployment (vercel[bot], a person). */
  creator: string | null;
  /** For a failed build read from the host: the line that names the failure, and the last lines of the log. */
  cause?: string | null;
  logTail?: string[];
  /** The host's own page for this deployment, when it gave one. */
  inspectorUrl?: string | null;
  /** The commit this deployment built, when the host said: short sha, branch, first line of the message. */
  sha?: string | null;
  ref?: string | null;
  message?: string | null;
  /** This failure's identity, for ignoring it; and whether the owner ignored it. */
  key?: string;
  ignored?: boolean;
};

export type NoticeView = {
  id: string;
  kind: ReceiptKind;
  vendor: string;
  /** The vendor's billing page, when known: every line has a way out. */
  vendorUrl: string | null;
  plan: string | null;
  subject: string | null;
  inbox: string;
  at: string | null;
  amountCents: number | null;
  currency: string | null;
  dueAt: string | null;
  projectNames: string[];
  domainNames: string[];
  verified: boolean;
};

export type ProjectHealth = "failed" | "attention" | "ok" | "idle" | "archived" | "unknown";

export type ProjectView = {
  id: string;
  /** "owner/repo" for a GitHub repo; "team/project" for a host project with no repo the map knows. */
  name: string;
  /** Where the row comes from: a GitHub repo, or a host project (Vercel) that deploys from no known repo. */
  kind: "repo" | "host";
  /** The host, for a host project. */
  host: string | null;
  /** The framework the host reports, for a host project. GitHub rows have none. */
  framework: string | null;
  url: string | null;
  productionUrl: string | null;
  uptime: UptimeState | null;
  private: boolean | null;
  defaultBranch: string | null;
  /** GitHub's primary language for the repo, when the sync stored it. */
  language: string | null;
  status: string | null;
  lastPushAt: string | null;
  health: ProjectHealth;
  deployments: DeploymentView[];
  elsewhere: { host: string; importUrl: string; guideUrl: string | null; guideTitle: string | null } | null;
  movedAt: string | null;
  movedFrom: string | null;
  monthlyCents: number | null;
  currency: string | null;
  /**
   * A push the host never built: the repo deploys on a connected host, the last push is newer
   * than the newest deployment by more than STALE_PUSH_MS, and nothing is building. Null otherwise.
   */
  stalePush: { pushedAt: string; lastDeployAt: string | null; host: string } | null;
  subscriptions: { id: string; vendor: string; plan: string | null; scope: VendorScope; monthlyCents: number | null; currency: string | null; inbox: string }[];
  notices: NoticeView[];
  openFindings: { id: string; kind: FindingKind; title: string; amountCents: number | null }[];
};

export type ProjectsReport = {
  projects: ProjectView[];
  /** Subscriptions no project claims; still money. */
  unlinked: Subscription[];
  totals: {
    projects: number;
    failed: number;
    attention: number;
    monthlyCents: number;
    /** Spend on idle and archived projects: the part that is probably drift. */
    quietMonthlyCents: number;
    /** Personal subscriptions seen in the same inboxes; listed elsewhere, never in monthlyCents. */
    personalMonthlyCents: number;
    unknownMonthlyCents: number;
    currency: string;
  };
};

/** When it happened: the charge date, else the email's date; never when we read it. */
function noticeAt(r: LoadedReceipt): string | null {
  return (r.billedAt ?? r.sentAt ?? null)?.toISOString() ?? null;
}

const NOTICE_KINDS: ReceiptKind[] = ["deployment", "incident_alert", "deprecation_notice", "account_security", "payment_failed", "renewal_notice", "trial_notice", "domain_or_dns", "plan_change"];
/** The failure facts a host sync stored on a deployment node, when it did. */
export function logFacts(a: Record<string, unknown>): { cause: string | null; logTail: string[]; inspectorUrl: string | null; sha: string | null; ref: string | null; message: string | null } {
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    cause: str(a.cause),
    logTail: Array.isArray(a.log_tail) ? (a.log_tail as unknown[]).filter((l): l is string => typeof l === "string") : [],
    inspectorUrl: str(a.inspector_url),
    sha: str(a.commit_sha)?.slice(0, 7) ?? (str(a.sha)?.slice(0, 7) ?? null),
    ref: str(a.commit_ref) ?? str(a.ref),
    message: str(a.commit_message),
  };
}

/**
 * One row per deployment. Vercel writes a GitHub deployment for every build it makes, so a repo
 * read from both sources shows "Production" (GitHub, vercel[bot]) and "production" (Vercel) for
 * the same build. The host's own row wins: it carries the log, the commit and the inspector link.
 */
export function dedupeDeployments(list: DeploymentView[]): DeploymentView[] {
  const hostEnvs = new Set(list.filter((d) => d.creator === "vercel").map((d) => d.environment.toLowerCase()));
  if (!hostEnvs.size) return list;
  return list.filter((d) => d.creator === "vercel" || !(providerFromCreator(d.creator) === "Vercel" && hostEnvs.has(d.environment.toLowerCase())));
}

const DAY = 86_400_000;
export const FAILED_STATES = new Set(["failure", "error"]);

type ProjectRow = { id: string; name: string; status: string | null; lastActivityAt: Date | null; attributes: Record<string, unknown>; kind: "repo" | "host"; host: string | null; hostLinked: string | null };

/** A push older than this with no deployment after it counts as a push the host never built. */
export const STALE_PUSH_MS = 20 * 60_000;

/**
 * The rows the map calls projects: every GitHub repo, plus every host project (Vercel) that
 * deploys from no repo the map knows. A host project linked to a known repo is folded into
 * that repo (its deployments hang off the repo), so nothing is listed twice.
 */
async function projectRows(userId: string): Promise<ProjectRow[]> {
  const db = getDb();
  const [repos, hostProjects, hostedOn, domains, pointsTo] = await Promise.all([
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "repo"))),
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "project"))),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "hosted_on"))),
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "domain"))),
    db.select({ fromNodeId: schema.edges.fromNodeId, toNodeId: schema.edges.toNodeId }).from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "points_to"))),
  ]);
  const domainById = new Map(domains.map((d) => [d.id, d]));
  const customByProject = new Map<string, string>();
  for (const edge of pointsTo.sort((x, y) => (domainById.get(x.fromNodeId)?.name ?? "").localeCompare(domainById.get(y.fromNodeId)?.name ?? ""))) {
    const d = domainById.get(edge.fromNodeId);
    if (d?.status === "verified" && !d.attributes.redirect_to && !customByProject.has(edge.toNodeId)) customByProject.set(edge.toNodeId, `https://${d.name}`);
  }
  const linked = new Set(hostedOn.map((e) => e.toNodeId));
  const hostByRepo = new Map<string, { provider: string; uptime: unknown; productionUrl: string | null }>();
  for (const e of hostedOn) {
    const p = hostProjects.find((x) => x.id === e.toNodeId);
    const provider = typeof (p?.attributes as Record<string, unknown> | undefined)?.provider === "string" ? String((p!.attributes as Record<string, unknown>).provider) : null;
    hostByRepo.set(e.fromNodeId, { provider: provider === "vercel" ? "Vercel" : (provider ?? "host"), uptime: p?.attributes.uptime, productionUrl: customByProject.get(e.toNodeId) ?? (typeof p?.attributes.production_url === "string" ? p.attributes.production_url : null) });
  }
  const rows: ProjectRow[] = repos.map((r) => ({ id: r.id, name: r.name, status: r.status, lastActivityAt: r.lastActivityAt, attributes: { ...r.attributes, uptime: hostByRepo.get(r.id)?.uptime, production_url: hostByRepo.get(r.id)?.productionUrl }, kind: "repo", host: null, hostLinked: hostByRepo.get(r.id)?.provider ?? null }));
  for (const p of hostProjects) {
    if (linked.has(p.id)) continue;
    const a = p.attributes as Record<string, unknown>;
    const provider = typeof a.provider === "string" ? a.provider : "host";
    const owner = typeof a.scope_slug === "string" && a.scope_slug ? a.scope_slug : provider;
    rows.push({ id: p.id, name: `${owner}/${p.name}`, status: p.status, lastActivityAt: p.lastActivityAt, attributes: { ...a, production_url: customByProject.get(p.id) ?? a.production_url }, kind: "host", host: provider === "vercel" ? "Vercel" : provider, hostLinked: null });
  }
  return rows;
}

/** The user's projects, in the shape repo matching reads: GitHub repos and host-only projects alike. */
export async function repoNodes(userId: string): Promise<RepoNode[]> {
  return (await projectRows(userId)).map((r) => ({ id: r.id, name: r.name, status: r.status, lastActivityAt: r.lastActivityAt }));
}

/** Receipts and spend a caller already loaded, so one request reads mail once. */
export type Preloaded = { receipts: LoadedReceipt[]; spend: SpendReport };

export async function projectsFor(userId: string, nowMs = Date.now(), pre?: Preloaded): Promise<ProjectsReport> {
  const db = getDb();
  const [repos, deployments, edges, findings, ignored] = await Promise.all([
    projectRows(userId),
    db.select().from(schema.nodes).where(and(eq(schema.nodes.userId, userId), eq(schema.nodes.kind, "deployment"))),
    db.select().from(schema.edges).where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "deploys"))),
    db.select().from(schema.findings).where(and(eq(schema.findings.userId, userId), eq(schema.findings.status, "open"))),
    ignoredKeys(userId),
  ]);
  const receipts = pre?.receipts ?? (await loadReceipts(userId));
  const spend = pre?.spend ?? (await spendFor(userId, nowMs, receipts));

  const depById = new Map(deployments.map((d) => [d.id, d]));
  const depsByRepo = new Map<string, DeploymentView[]>();
  for (const e of edges) {
    const d = depById.get(e.toNodeId);
    if (!d) continue;
    const a = d.attributes as Record<string, unknown>;
    const list = depsByRepo.get(e.fromNodeId) ?? [];
    const url = typeof a.url === "string" ? a.url : null;
    const creator = typeof a.creator === "string" ? a.creator : null;
    const environment = String(a.environment ?? "unknown");
    const at = d.lastActivityAt?.toISOString() ?? null;
    const key = breakKey(d.id, at);
    list.push({
      environment,
      label: environment.replace(/\s+/g, " ").trim(),
      state: d.status,
      url,
      at,
      provider: providerOf(url, creator),
      creator,
      ...logFacts(a),
      key,
      ignored: FAILED_STATES.has(d.status ?? "") && ignored.has(key),
    });
    depsByRepo.set(e.fromNodeId, list);
  }
  for (const [id, list] of depsByRepo) depsByRepo.set(id, dedupeDeployments(list));

  const repoRefs: RepoNode[] = repos.map((r) => ({ id: r.id, name: r.name, status: r.status, lastActivityAt: r.lastActivityAt }));
  const repoByName = new Map(repoRefs.map((r) => [r.name, r]));
  const links = linkSubscriptions(spend.subscriptions, receipts, repoRefs);
  const subsByRepo = new Map<string, Subscription[]>();
  const claimed = new Set<string>();
  for (const s of spend.subscriptions) {
    // A line that pays for two repos is listed under both (Spend's project filter agrees).
    for (const name of links.get(s.id) ?? []) {
      const repo = repoByName.get(name);
      if (!repo) continue;
      const list = subsByRepo.get(repo.id) ?? [];
      if (!list.includes(s)) list.push(s);
      subsByRepo.set(repo.id, list);
      claimed.add(s.id);
    }
  }

  const noticesByRepo = new Map<string, NoticeView[]>();
  for (const r of receipts) {
    if (!NOTICE_KINDS.includes(r.kind)) continue;
    const view: NoticeView = {
      id: r.id,
      kind: r.kind,
      vendor: r.vendor,
      vendorUrl: billingUrl(r.vendor),
      plan: r.plan,
      subject: r.subject,
      inbox: r.inbox,
      at: noticeAt(r),
      amountCents: r.amountCents,
      currency: r.currency,
      dueAt: r.dueAt?.toISOString() ?? null,
      projectNames: r.projectNames,
      domainNames: r.domainNames,
      verified: r.senderVerified,
    };
    for (const p of [...r.projectNames, ...r.domainNames]) {
      const repo = matchRepo(p, repoRefs);
      if (!repo) continue;
      const list = noticesByRepo.get(repo.id) ?? [];
      list.push(view);
      noticesByRepo.set(repo.id, list);
      break;
    }
  }

  const findingsByRepo = new Map<string, typeof findings>();
  for (const f of findings) {
    const repoIds = new Set<string>(f.nodeIds);
    if (f.evidence.repo) {
      const repo = repoRefs.find((r) => r.name === f.evidence.repo);
      if (repo) repoIds.add(repo.id);
    }
    for (const id of repoIds) {
      const list = findingsByRepo.get(id) ?? [];
      list.push(f);
      findingsByRepo.set(id, list);
    }
  }

  const projects: ProjectView[] = repos.map((r) => {
    const a = r.attributes;
    const deps = (depsByRepo.get(r.id) ?? []).sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
    // The host for the move link: the newest successful production deploy, else the newest
    // production deploy in any state, so a site that is failing on another host still counts.
    const currentHost = productionHost(deps)?.host ?? deps.find((d) => d.environment.toLowerCase() === "production" && d.provider)?.provider ?? null;
    const move = r.kind === "repo" ? moveHome({ host: currentHost, repoFullName: r.name, repoUrl: typeof a.url === "string" ? a.url : null, language: typeof a.language === "string" ? a.language : null, creator: deps.find((d) => d.environment.toLowerCase() === "production")?.creator }) : null;
    const subs = subsByRepo.get(r.id) ?? [];
    const notices = (noticesByRepo.get(r.id) ?? []).sort((x, y) => (y.at ?? "").localeCompare(x.at ?? "")).slice(0, 8);
    const open = findingsByRepo.get(r.id) ?? [];
    const monthly = subs.reduce<number | null>((sum, s) => (s.monthlyCents === null || s.scope !== "work" ? sum : (sum ?? 0) + s.monthlyCents), null);
    const within = (iso: string | null, days: number) => Boolean(iso && nowMs - Date.parse(iso) <= days * DAY);
    // Deploys count as activity: a site deployed from a laptop or another repo is not idle,
    // even when this repo has had no push (or was archived on GitHub) for months.
    const newestProductionAt = deps.filter((d) => d.state === "success" && d.environment.toLowerCase() === "production" && d.at).map((d) => d.at as string).sort().at(-1) ?? null;
    const idleDays = r.lastActivityAt ? (nowMs - r.lastActivityAt.getTime()) / DAY : null;
    const idle = idleDays !== null && idleDays > 90 && !within(newestProductionAt, 90);
    const archivedButLive = r.status === "archived" && within(newestProductionAt, 30);
    const failedDeploy = (d: DeploymentView) => Boolean(d.state && FAILED_STATES.has(d.state) && !d.ignored);
    // A failure counts as "broken" for 30 days, unless the host deployed successfully after it:
    // the same environment for a failed deployment, any environment for a "deploy failed" email.
    // Older failures stay listed but do not make the project red.
    const laterSuccess = (env: string | null, since: string | null) =>
      deps.some((d) => d.state === "success" && d.at && (!since || d.at > since) && (!env || d.environment === env));
    const recentDeployFailure = deps.some((d) => failedDeploy(d) && within(d.at, 30) && !laterSuccess(d.environment, d.at));
    const recentNoticeFailure = notices.some((n) => n.kind === "deployment" && within(n.at, 30) && !laterSuccess(null, n.at));
    const oldFailure = !recentDeployFailure && deps.some(failedDeploy);
    // A push the host never built: only for repos a host connection links, so "no deploy" is the host's word.
    const newestDeployAt = deps.map((d) => d.at).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
    const building = deps.some((d) => d.state === "in_progress" || d.state === "queued" || d.state === "pending");
    const stalePush =
      r.kind === "repo" && r.hostLinked && r.lastActivityAt && !building && r.status !== "archived" && nowMs - r.lastActivityAt.getTime() >= STALE_PUSH_MS && (!newestDeployAt || Date.parse(newestDeployAt) + STALE_PUSH_MS < r.lastActivityAt.getTime())
        ? { pushedAt: r.lastActivityAt.toISOString(), lastDeployAt: newestDeployAt, host: r.hostLinked }
        : null;
    const recentTrouble = notices.some((n) => (n.kind === "payment_failed" || n.kind === "incident_alert") && within(n.at, 30));
    let health: ProjectHealth = "unknown";
    if (r.status === "archived" && !archivedButLive) health = "archived";
    else if (recentDeployFailure || recentNoticeFailure) health = "failed";
    else if (idle) health = "idle";
    else if (open.length || recentTrouble || oldFailure || stalePush) health = "attention";
    // "ok" needs a deployment the map has seen. A repo with pushes and no deploys is unknown, not fine.
    else if (deps.length) health = "ok";
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      host: r.host,
      framework: r.kind === "host" && typeof a.framework === "string" ? a.framework : null,
      url: r.kind === "host" ? (typeof a.production_url === "string" ? a.production_url : null) : typeof a.url === "string" ? a.url : null,
      productionUrl: typeof a.production_url === "string" ? a.production_url : null,
      uptime: a.uptime && typeof a.uptime === "object" && "state" in a.uptime ? a.uptime as UptimeState : null,
      private: typeof a.private === "boolean" ? a.private : null,
      defaultBranch: typeof a.default_branch === "string" ? a.default_branch : null,
      language: typeof a.language === "string" ? a.language : null,
      status: r.status,
      lastPushAt: r.lastActivityAt?.toISOString() ?? null,
      health,
      deployments: deps,
      elsewhere: move ? { host: move.host, importUrl: move.importUrl, guideUrl: move.guide?.url ?? null, guideTitle: move.guide?.title ?? null } : null,
      movedAt: typeof a.movedToVercelAt === "string" ? a.movedToVercelAt : null,
      movedFrom: typeof a.movedFrom === "string" ? a.movedFrom : null,
      monthlyCents: monthly,
      currency: subs.find((s) => s.currency)?.currency ?? null,
      stalePush,
      subscriptions: subs.map((s) => ({ id: s.id, vendor: s.vendor, plan: s.plan, scope: s.scope, monthlyCents: s.monthlyCents, currency: s.currency, inbox: s.inbox })),
      notices,
      openFindings: open.map((f) => ({ id: f.id, kind: f.kind, title: f.title, amountCents: f.amountCents })),
    };
  });

  const moves = await Promise.all(repos.filter((r) => r.kind === "repo").map(async (r) => ({ id: r.id, move: await recordProductionMove({ userId, nodeId: r.id, attributes: r.attributes, deployments: depsByRepo.get(r.id) ?? [] }) })));
  for (const { id, move } of moves) {
    if (!move) continue;
    const project = projects.find((p) => p.id === id);
    if (project) { project.movedAt = move.at; project.movedFrom = move.from; }
  }

  const order: Record<ProjectHealth, number> = { failed: 0, attention: 1, ok: 2, unknown: 3, idle: 4, archived: 5 };
  projects.sort((x, y) => order[x.health] - order[y.health] || (y.lastPushAt ?? "").localeCompare(x.lastPushAt ?? ""));

  return {
    projects,
    unlinked: spend.subscriptions.filter((s) => !claimed.has(s.id)),
    totals: {
      projects: projects.length,
      failed: projects.filter((p) => p.health === "failed").length,
      attention: projects.filter((p) => p.health === "attention").length,
      monthlyCents: spend.monthlyCents,
      personalMonthlyCents: spend.personalMonthlyCents,
      unknownMonthlyCents: spend.unknownMonthlyCents,
      // Each line once, even when it pays for two quiet repos.
      quietMonthlyCents: [
        ...new Map(
          projects
            .filter((p) => p.health === "idle" || p.health === "archived")
            .flatMap((p) => p.subscriptions)
            .filter((s) => s.scope === "work" && s.monthlyCents !== null)
            .map((s) => [s.id, s.monthlyCents as number]),
        ).values(),
      ].reduce((sum, c) => sum + c, 0),
      currency: spend.currency,
    },
  };
}

/** Notices across every inbox and vendor, newest first: the activity feed. */
export async function activityFor(userId: string, opts: { limit?: number; sinceMs?: number } = {}): Promise<NoticeView[]> {
  const receipts = await loadReceipts(userId);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const items = receipts
    .filter((r) => NOTICE_KINDS.includes(r.kind) || (r.kind === "receipt" && r.amountCents !== null && r.amountCents > 0))
    .map<NoticeView>((r) => ({
      id: r.id,
      kind: r.kind,
      vendor: r.vendor,
      vendorUrl: billingUrl(r.vendor),
      plan: r.plan,
      subject: r.subject,
      inbox: r.inbox,
      at: noticeAt(r),
      amountCents: r.amountCents,
      currency: r.currency,
      dueAt: r.dueAt?.toISOString() ?? null,
      projectNames: r.projectNames,
      domainNames: r.domainNames,
      verified: r.senderVerified,
    }))
    .filter((n) => !opts.sinceMs || (n.at && Date.parse(n.at) >= opts.sinceMs))
    .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
  return items.slice(0, limit);
}

/** Deployment nodes whose latest state is a failure: live problems from GitHub, for the same feed. */
/** A failure older than this is history, not "still failing": the project was abandoned, not broken. */
export const FAILED_WINDOW_MS = 30 * DAY;

/**
 * Pure: failed deployments that belong only to retired projects (an archived repo whose site has
 * not deployed to production in 30 days). Today hides those projects, so incidents, the agent
 * inbox and MCP do too; an archived repo whose site still deploys keeps its failures.
 */
export function retiredFailures(failedIds: string[], links: { from: string; to: string }[], archived: Set<string>, live: Set<string>): Set<string> {
  const owners = new Map<string, string[]>();
  for (const l of links) owners.set(l.to, [...(owners.get(l.to) ?? []), l.from]);
  return new Set(failedIds.filter((id) => (owners.get(id) ?? []).length > 0 && (owners.get(id) ?? []).every((repo) => archived.has(repo) && !live.has(repo))));
}

/** The failed deployment ids whose projects are retired, read from the graph. */
export async function retiredFailureIds(userId: string, failedIds: string[], nowMs: number): Promise<Set<string>> {
  if (!failedIds.length) return new Set();
  const db = getDb();
  const deploys = (ids: string[], side: "to" | "from") =>
    db
      .select({ from: schema.edges.fromNodeId, to: schema.edges.toNodeId })
      .from(schema.edges)
      .where(and(eq(schema.edges.userId, userId), eq(schema.edges.kind, "deploys"), inArray(side === "to" ? schema.edges.toNodeId : schema.edges.fromNodeId, ids)));
  const links = await deploys(failedIds, "to");
  const repoIds = [...new Set(links.map((l) => l.from))];
  if (!repoIds.length) return new Set();
  const archivedRows = await db
    .select({ id: schema.nodes.id })
    .from(schema.nodes)
    .where(and(eq(schema.nodes.userId, userId), inArray(schema.nodes.id, repoIds), eq(schema.nodes.status, "archived")));
  const archived = new Set(archivedRows.map((r) => r.id));
  if (!archived.size) return new Set();
  const theirs = await deploys([...archived], "from");
  const okRows = theirs.length
    ? await db
        .select({ id: schema.nodes.id, attributes: schema.nodes.attributes })
        .from(schema.nodes)
        .where(and(eq(schema.nodes.userId, userId), inArray(schema.nodes.id, [...new Set(theirs.map((t) => t.to))]), eq(schema.nodes.status, "success"), gte(schema.nodes.lastActivityAt, new Date(nowMs - FAILED_WINDOW_MS))))
    : [];
  const prodOk = new Set(okRows.filter((r) => String((r.attributes as Record<string, unknown>).environment ?? "").toLowerCase() === "production").map((r) => r.id));
  const live = new Set(theirs.filter((t) => prodOk.has(t.to)).map((t) => t.from));
  return retiredFailures(failedIds, links, archived, live);
}

export async function failedDeployments(userId: string, nowMs = Date.now()) {
  const ignored = await ignoredKeys(userId);
  const rows = await getDb()
    .select()
    .from(schema.nodes)
    .where(
      and(
        eq(schema.nodes.userId, userId),
        eq(schema.nodes.kind, "deployment"),
        inArray(schema.nodes.status, [...FAILED_STATES]),
        gte(schema.nodes.lastActivityAt, new Date(nowMs - FAILED_WINDOW_MS)),
      ),
    )
    .orderBy(desc(schema.nodes.lastActivityAt));
  const retired = await retiredFailureIds(userId, rows.map((d) => d.id), nowMs);
  return rows.flatMap((d) => {
    if (retired.has(d.id)) return [];
    const a = d.attributes as Record<string, unknown>;
    const url = typeof a.url === "string" ? a.url : null;
    const creator = typeof a.creator === "string" ? a.creator : null;
    const environment = String(a.environment ?? "");
    const at = d.lastActivityAt?.toISOString() ?? null;
    const key = breakKey(d.id, at);
    if (ignored.has(key)) return [];
    return [{ id: d.id, key, name: d.name, environment, label: environment.replace(/\s+/g, " ").trim(), url, state: d.status, at, provider: providerOf(url, creator), ...logFacts(a) }];
  });
}

/**
 * One project's page: GET /api/v1/projects/{owner}/{repo}. Null when the user has no repo by
 * that name (compared without case). Reads mail once and shares it with projectsFor.
 */
export async function projectPageFor(userId: string, name: string, nowMs = Date.now()): Promise<ProjectPage | null> {
  const receipts = await loadReceipts(userId);
  const spend = await spendFor(userId, nowMs, receipts);
  const report = await projectsFor(userId, nowMs, { receipts, spend });
  const p = report.projects.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!p) return null;
  const repoRefs: RepoNode[] = report.projects.map((x) => ({ id: x.id, name: x.name, status: x.status, lastActivityAt: x.lastPushAt ? new Date(x.lastPushAt) : null }));
  const links = linkSubscriptions(spend.subscriptions, receipts, repoRefs);
  const findings = await getDb().select().from(schema.findings).where(eq(schema.findings.userId, userId));
  const page = buildProjectPage({
    repo: {
      id: p.id,
      name: p.name,
      url: p.url,
      private: p.private,
      defaultBranch: p.defaultBranch,
      language: p.language,
      status: p.status,
      lastPushAt: p.lastPushAt,
      health: p.health,
    },
    deployments: p.deployments.map((d) => ({ environment: d.environment, state: d.state, url: d.url, at: d.at, provider: d.provider, creator: d.creator })),
    lines: spend.subscriptions.map((s) => ({ ...s, projects: links.get(s.id) ?? [] })),
    receipts: receipts.map((r) => ({
      id: r.id,
      kind: r.kind,
      vendor: r.vendor,
      amountCents: r.amountCents,
      currency: r.currency,
      at: noticeAt(r),
      dueAt: r.dueAt?.toISOString() ?? null,
      projectNames: r.projectNames,
      domainNames: r.domainNames,
      inbox: r.inbox,
      subject: r.subject,
      verified: r.senderVerified,
    })),
    findings: findings.map((f): PageFinding => publicFinding(f)),
    repoNames: report.projects.map((x) => x.name),
    currency: spend.currency,
    nowMs,
  });
  return { ...page, elsewhere: p.elsewhere };
}
