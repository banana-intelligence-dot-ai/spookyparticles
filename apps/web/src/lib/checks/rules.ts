import type { VercelProject } from "@/lib/providers/vercel";
import { detectServices } from "@/lib/services/catalog";

/** Most serious first: a key already public, then doors left open, then hygiene. Lists and the agent queue follow this order. */
export const CHECK_KEYS = ["secret_in_public_code", "previews_open", "cron_unguarded", "secret_not_sensitive", "deps_not_updated"] as const;
export type CheckKey = typeof CHECK_KEYS[number];
export type CheckState = "open" | "ok" | "unknown" | "not_applicable";
export type Decision = { state: CheckState; reason: string | null; evidence: Record<string, unknown> };
const decision = (state: CheckState, reason: string | null = null, evidence: Record<string, unknown> = {}): Decision => ({ state, reason, evidence });
export const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "PUBLIC_", "VITE_", "NUXT_PUBLIC_", "EXPO_PUBLIC_", "GATSBY_", "REACT_APP_"];
const isPublic = (name: string) => PUBLIC_PREFIXES.some((p) => name.toUpperCase().startsWith(p));
const looksSecret = (name: string) => /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|_KEY$|SERVICE_ROLE|DATABASE_URL|POSTGRES(QL)?_URL|REDIS_URL|MONGO(DB)?_UR[IL]|_DSN$|CREDENTIAL)/i.test(name);
export const PREVIEW_PROTECTED = ["all_except_custom_domains", "prod_deployment_urls_and_all_previews", "all", "preview"];
const ENV_TYPES = ["plain", "encrypted", "sensitive", "secret", "system"];
const activeTarget = (targets: string[]) => targets.some((t) => t === "production" || t === "preview");

export function previewRule(project: Pick<VercelProject, "protection">): Decision {
  const p = project.protection;
  if (!p) return decision("unknown", "needs_read_token");
  if (p.passwordProtection || p.trustedIps) return decision("ok");
  if (!p.ssoProtection) return decision("open");
  // Vercel's four values; every one of them covers preview links. Standard Protection, the default, is the first.
  const type = p.ssoProtection.deploymentType;
  return type && PREVIEW_PROTECTED.includes(type) ? decision("ok") : decision("unknown", "setting_not_recognized");
}

export function sensitiveRule(project: Pick<VercelProject, "env">): Decision {
  if (!project.env) return decision("unknown", "needs_read_token");
  const candidates = project.env.filter((v) => !isPublic(v.key) && looksSecret(v.key));
  // We had the list, so a token is not what is missing. Say what was: a type or a target we do not know.
  // The type is one of Vercel's own words, never a value; it is kept so the next reader can teach the rule.
  const strange = candidates.filter((v) => !v.targets.length || !ENV_TYPES.includes(v.type));
  if (strange.length) return decision("unknown", "setting_not_recognized", {
    types: [...new Set(strange.filter((v) => !ENV_TYPES.includes(v.type)).map((v) => (/^[a-z_-]{1,24}$/i.test(v.type) ? v.type : "other")))].sort().slice(0, 5),
    noTarget: strange.filter((v) => !v.targets.length).length,
  });
  const active = candidates.filter((v) => activeTarget(v.targets));
  const matches = active.filter((v) => v.type === "plain" || v.type === "encrypted");
  return decision(matches.length ? "open" : "ok", null, {
    names: [...new Set(matches.map((v) => v.key))].sort().slice(0, 20),
    plain: matches.filter((v) => v.type === "plain").length,
    readable: matches.filter((v) => v.type === "encrypted").length,
    // How many secret-looking variables we judged, so a pass can say what it rests on.
    checked: new Set(active.map((v) => v.key)).size,
  });
}

export function publicNameRule(project: Pick<VercelProject, "env">): Decision | null {
  if (!project.env) return null;
  const hit = project.env.find((v) => isPublic(v.key) && /(SECRET|PRIVATE|PASSWORD|SERVICE_ROLE)/i.test(v.key));
  return hit ? decision("open", null, { kind: "name", name: hit.key }) : null;
}

export function cronRule(project: Pick<VercelProject, "env" | "schedules">): Decision {
  const paths = (project.schedules ?? []).map((s) => s.path).filter((p): p is string => typeof p === "string").sort();
  if (!paths.length) return decision("not_applicable", "no_schedules");
  if (!project.env) return decision("unknown", "needs_read_token");
  if (project.env.some((v) => v.key === "CRON_SECRET" && !v.targets.length)) return decision("unknown", "setting_not_recognized", { noTarget: 1 });
  return decision(project.env.some((v) => v.key === "CRON_SECRET" && v.targets.includes("production")) ? "ok" : "open", null, { paths });
}

export type ProjectDecisions = { previews: Decision; sensitive: Decision; cron: Decision; publicName: Decision | null };
/** The four decisions that come from a project's settings. Only these leave the sync step; the list of names does not. */
export function projectDecisions(project: Pick<VercelProject, "protection" | "env" | "schedules">): ProjectDecisions {
  return { previews: previewRule(project), sensitive: sensitiveRule(project), cron: cronRule(project), publicName: publicNameRule(project) };
}

export type SyncProject = Omit<VercelProject, "env" | "protection"> & { checks?: ProjectDecisions; services?: string[] };
/** What a project carries between sync steps: the decisions, never the list of variable names or the protection settings. */
export function slimForSync(project: VercelProject): SyncProject {
  const rest: VercelProject = { ...project };
  delete rest.env;
  delete rest.protection;
  return { ...rest, ...(project.env ? { services: detectServices(project.env.map((v) => v.key)) } : {}), ...(project.env && project.protection ? { checks: projectDecisions(project) } : {}) };
}

export const DEPENDENCY_FILES = [".github/dependabot.yml", ".github/dependabot.yaml", "renovate.json", "renovate.json5", ".github/renovate.json", ".github/renovate.json5", ".renovaterc", ".renovaterc.json"];
export function depsRule(repo: { linked: boolean; covered?: boolean; private?: boolean; files?: string[]; failed?: boolean }): Decision {
  if (!repo.linked) return decision("not_applicable", "no_repo");
  if (!repo.covered) return decision("unknown", "needs_github");
  if (repo.private) return decision("unknown", "private_repo");
  if (repo.failed || !repo.files) return decision("unknown", "repo_not_readable");
  return decision(repo.files.some((f) => DEPENDENCY_FILES.includes(f)) ? "ok" : "open", null, { files: repo.files });
}

/** How long a real answer stands against a connection that could not read the setting. */
export const KNOWN_ANSWER_HOLD_MS = 24 * 60 * 60_000;

/**
 * Two connections can see one project (a token and the integration). The one that cannot read a
 * setting says "needs_read_token"; that must not erase the answer the other one just read.
 * A real answer older than the hold gives way, so a revoked token does not leave a stale answer up.
 */
export function keepPriorAnswer(prior: { state: string; checkedAt: Date | null } | null, result: Decision, now: Date): boolean {
  if (!prior || result.state !== "unknown" || result.reason !== "needs_read_token") return false;
  if (prior.state === "unknown" || !prior.checkedAt) return false;
  return now.getTime() - prior.checkedAt.getTime() < KNOWN_ANSWER_HOLD_MS;
}

export function transition(previous: { state: string; firstOpenAt: Date | null; fixedAt: Date | null } | null, state: CheckState, now: Date) {
  let firstOpenAt = previous?.firstOpenAt ?? null;
  let fixedAt = previous?.fixedAt ?? null;
  if (state === "open") {
    if (!previous || previous.state === "ok" || fixedAt || !firstOpenAt) { firstOpenAt = now; fixedAt = null; }
  } else if (state === "ok" && previous && (previous.state === "open" || (previous.state === "unknown" && firstOpenAt && !fixedAt))) fixedAt = now;
  return { firstOpenAt, fixedAt };
}
