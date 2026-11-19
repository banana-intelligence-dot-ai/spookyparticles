/**
 * "Did my push go live, and does the page show it": the newest deployment per environment, whether a
 * commit is live in production, and, when asked, whether the production page answers 200 and contains
 * the expected text. The page read goes only to the project's own production host (no address from the
 * caller), over https, pinned to a public address, and stores nothing.
 */
import { safeGet, visibleText, type AgentViewDeps } from "@/lib/agent-view";
import { incidentsFor } from "@/lib/incidents";
import { projectsFor } from "@/lib/projects";

export type PushCheckInput = { repo: string; sha?: string; path?: string; expectText?: string };
export type PageState = "shows" | "missing_text" | "bad_status" | "site_protected" | "unreachable" | "no_production_site";
export type PageCheck = { url: string | null; status: number | null; state: PageState; summary: string };

const PAGE_LIMIT = 3 * 1024 * 1024;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-fA-F0-9]{7,40}$/;

/** Throws a plain message for a bad input; returns the cleaned input otherwise. */
export function pushCheckInput(raw: Record<string, unknown>): PushCheckInput {
  const { repo, sha, path, expectText } = raw;
  if (typeof repo !== "string" || repo.length > 120 || !REPO.test(repo)) throw new Error("repo must be owner/repo");
  if (sha !== undefined && (typeof sha !== "string" || !SHA.test(sha))) throw new Error("sha must be a 7 to 40 character commit hash");
  if (path !== undefined && (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 300 || /[\s#\\]/.test(path))) throw new Error("path must start with / and be at most 300 characters, with no spaces or #");
  if (expectText !== undefined && (typeof expectText !== "string" || !expectText.trim() || expectText.length > 200)) throw new Error("expectText must be 1 to 200 characters");
  if (path !== undefined && expectText === undefined) throw new Error("path needs expectText");
  return { repo, ...(sha ? { sha } : {}), ...(path ? { path } : {}), ...(expectText ? { expectText: expectText.trim() } : {}) };
}

const SUMMARY: Record<PageState, (url: string, text: string, status: number | null) => string> = {
  shows: (url, text) => `${url} answers 200 and shows "${text}".`,
  missing_text: (url, text) => `${url} answers 200 but does not show "${text}" yet. A cache may still hold the old page; ask again in a minute.`,
  bad_status: (url, _t, status) => `${url} answered ${status}.`,
  site_protected: (url) => `${url} asks for a login, so Spooky cannot read it.`,
  unreachable: (url) => `${url} did not answer in time, or redirected off the site.`,
  no_production_site: () => "This repo has no production site Spooky knows about.",
};

/** Reads one page on the production host and says whether it shows the text, in the HTML or in the words a person sees. */
export async function pageShows(productionUrl: string | null, path: string, expectText: string, deps: AgentViewDeps = {}): Promise<PageCheck> {
  const done = (url: string | null, status: number | null, state: PageState): PageCheck => ({ url, status, state, summary: SUMMARY[state](url ?? "", expectText, status) });
  let base: URL;
  try { base = new URL(productionUrl ?? ""); } catch { return done(null, null, "no_production_site"); }
  const url = new URL(path, base.origin);
  const host = base.hostname.toLowerCase();
  const got = await safeGet(url, new Set([host]), { accept: "text/html,application/xhtml+xml", "cache-control": "no-cache" }, PAGE_LIMIT, Date.now() + 10_000, deps);
  if (!got) return done(url.toString(), null, "unreachable");
  const { status, body } = got.page;
  if (status === 401 || status === 403) return done(url.toString(), status, "site_protected");
  if (status !== 200) return done(url.toString(), status, "bad_status");
  const want = expectText.replace(/\s+/g, " ");
  const shows = body.includes(expectText) || visibleText(body).includes(want);
  return done(got.url.toString(), status, shows ? "shows" : "missing_text");
}

const startsAlike = (a: string, b: string) => a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase());

export async function pushCheckFor(userId: string, input: PushCheckInput, deps: AgentViewDeps = {}) {
  const incidentReport = await incidentsFor(userId, input.repo);
  const project = (await projectsFor(userId)).projects.find((p) => p.name.toLowerCase() === input.repo.toLowerCase() && p.kind === "repo");
  if (!project) throw new Error("Unknown repo");
  const latest = new Map<string, (typeof project.deployments)[number]>();
  for (const deploy of project.deployments) {
    const environment = deploy.environment.toLowerCase();
    const current = latest.get(environment);
    if (!current || (deploy.at ?? "") > (current.at ?? "")) latest.set(environment, deploy);
  }
  const deployments = [...latest.values()].map((d) => ({ environment: d.environment, host: d.provider, state: d.state, at: d.at, url: d.url, sha: d.sha ?? null, message: d.message ?? null }));
  const production = latest.get("production");
  const shaLive = input.sha ? Boolean(production?.state === "success" && production.sha && startsAlike(production.sha, input.sha)) : undefined;
  const commit = input.sha ? commitState(project.deployments, input.sha, shaLive!) : undefined;
  const page = input.expectText ? await pageShows(project.productionUrl, input.path ?? "/", input.expectText, deps) : undefined;
  const checks = [shaLive, page ? page.state === "shows" : undefined].filter((v): v is boolean => v !== undefined);
  // Spooky reads hosts in the background, so a deploy that just finished can be missing from this answer.
  const soon = commit === "building" || commit === "not_seen_yet" || page?.state === "missing_text";
  return {
    repo: project.name,
    repoRefreshed: incidentReport.repoRefreshed,
    deployments,
    ...(input.sha ? { sha: input.sha, shaLive, commit } : {}),
    ...(page ? { page } : {}),
    ...(checks.length ? { live: checks.every(Boolean), ...(checks.every(Boolean) ? {} : soon ? { retryAfterSeconds: 60 } : {}) } : {}),
  };
}

const BUILDING = new Set(["in_progress", "queued", "pending"]);

/** Where one commit stands in production: live, building, failed, replaced by a newer deploy, or not seen yet. */
export function commitState(deploys: { environment: string; state: string | null; sha?: string | null }[], sha: string, live: boolean): "live" | "building" | "failed" | "replaced" | "not_seen_yet" {
  if (live) return "live";
  const mine = deploys.filter((d) => d.environment.toLowerCase() === "production" && d.sha && startsAlike(d.sha, sha));
  if (mine.some((d) => BUILDING.has(d.state ?? ""))) return "building";
  if (mine.some((d) => d.state === "success" || d.state === "inactive")) return "replaced";
  if (mine.length) return "failed";
  return "not_seen_yet";
}
