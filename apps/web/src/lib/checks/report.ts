import type { schema } from "@/db";
import { CHECK_CATALOG, wordsFor } from "./catalog";
import { CHECK_KEYS, type CheckKey } from "./rules";
import { MAX_ATTEMPTS, handoffSummary, type Attempt } from "./handoff";

type Node = typeof schema.nodes.$inferSelect;
type Row = typeof schema.projectChecks.$inferSelect;
/** Position of a project's most serious open finding; projects with none sort last. */
const worst = (checks: { state: string; dismissedAt: Date | null }[]) => {
  const i = checks.findIndex((c) => c.state === "open" && !c.dismissedAt);
  return i === -1 ? CHECK_KEYS.length : i;
};

/**
 * "owner/name" of the GitHub repo a project deploys from, or null. The Vercel sync stores it as
 * attributes.repo (a string) with attributes.repo_provider beside it; anything else is not a repo we can name.
 */
export function linkedRepo(node: Node): string | null {
  const a = node.attributes;
  return a.repo_provider === "github" && typeof a.repo === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(a.repo) ? a.repo : null;
}

export function checkReport(nodes: Node[], rows: Row[], ready: boolean, attempts: Attempt[] = [], now = new Date()) {
  const projects = nodes.filter((n) => n.kind === "project" && n.externalKey.startsWith("vercel:project:")).map((node) => {
    const a = node.attributes;
    const team = typeof a.scope_slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(a.scope_slug) && a.scope_slug !== "scoped" ? a.scope_slug : null;
    const productionUrl = typeof a.production_url === "string" ? a.production_url : null;
    const checks = CHECK_KEYS.map((check: CheckKey) => {
      const row = rows.find((r) => r.nodeId === node.id && r.check === check);
      const spec = CHECK_CATALOG[check];
      const settingUrl = team && spec.fix.settingPath ? `https://vercel.com/${encodeURIComponent(team)}/${encodeURIComponent(node.name)}/settings/${spec.fix.settingPath}` : undefined;
      // No row yet means no answer yet. Say so; never guess at the reason.
      const state = row?.state ?? "unknown";
      const reason = row ? row.reason : "check_pending";
      const words = wordsFor(check, row?.evidence ?? {});
      const title = state === "open" ? words.title : state === "ok" ? words.okTitle : spec.name;
      return { id: row?.id ?? null, check, state, reason, source: row?.source ?? "verified", name: spec.name, title, severity: spec.severity, why: spec.why, ...(spec.limit ? { limit: spec.limit } : {}),
        fix: { text: words.fixText, ...(spec.fix.steps ? { steps: spec.fix.steps } : {}), docUrl: spec.fix.docUrl, ...(settingUrl ? { settingUrl } : {}) }, evidence: row?.evidence ?? {},
        firstOpenAt: row?.firstOpenAt ?? null, fixedAt: row?.fixedAt ?? null, dismissedAt: row?.dismissedAt ?? null, checkedAt: row?.checkedAt ?? null,
        handoff: row ? handoffSummary(row, attempts, now) : { attempts: 0, max: MAX_ATTEMPTS, capped: false, inProgress: false, last: null } };
    });
    return { nodeId: node.id, name: node.name, repo: linkedRepo(node), productionUrl, checks };
  }).sort((a, b) => worst(a.checks) - worst(b.checks) || a.name.localeCompare(b.name));
  return { ready, summary: { projects: projects.length, open: projects.flatMap((p) => p.checks).filter((c) => c.state === "open" && !c.dismissedAt).length,
    fixed: projects.flatMap((p) => p.checks).filter((c) => c.state === "ok" && c.fixedAt).length,
    unknown: projects.flatMap((p) => p.checks).filter((c) => c.state === "unknown").length }, projects };
}
