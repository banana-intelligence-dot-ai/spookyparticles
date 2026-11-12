/** Vercel runtime deprecations checked 2026-11-10.
 * https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
 * https://vercel.com/changelog/node-js-14-and-16-are-being-deprecated
 * https://vercel.com/changelog/node-js-18-is-being-deprecated
 * https://vercel.com/changelog/node-js-20-is-being-deprecated
 * Vercel has not published deprecation dates for 22.x or 24.x.
 */
export const RUNTIME_DEPRECATIONS: Record<string, string> = {
  "14.x": "2023-08-15",
  "16.x": "2025-01-31",
  "18.x": "2025-09-01",
  "20.x": "2026-10-01",
};

export type ExpirationNode = { kind: string; name: string; attributes: Record<string, unknown> };
export type Expiration = { kind: "node_runtime" | "domain"; name: string; project?: string; date: string; daysLeft: number; autoRenew?: boolean };

const day = 86_400_000;
const dateOnly = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/** Dated facts only. A project-domain row without a registrar date is reported separately as unknown. */
export function expirations(nodes: ExpirationNode[], now = new Date()): Expiration[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const items: Expiration[] = [];
  for (const node of nodes) {
    if (node.kind === "project" && node.attributes.provider === "vercel") {
      const version = node.attributes.node_version;
      const date = typeof version === "string" ? RUNTIME_DEPRECATIONS[version] : undefined;
      if (date) items.push({ kind: "node_runtime", name: `Node.js ${version}`, project: node.name, date, daysLeft: Math.round((Date.parse(date) - today) / day) });
    }
    if (node.kind === "domain" && node.attributes.provider === "vercel") {
      const date = dateOnly(node.attributes.expires_at);
      if (date) items.push({ kind: "domain", name: node.name, date, daysLeft: Math.round((Date.parse(date) - today) / day), ...(typeof node.attributes.auto_renew === "boolean" ? { autoRenew: node.attributes.auto_renew } : {}) });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** The current alert window. A sweep can arrive late without backfilling earlier windows. */
export function alertThreshold(item: Expiration): 30 | 7 | 1 | null {
  if (item.daysLeft < 1 || item.daysLeft > 30) return null;
  if (item.daysLeft <= 1) return 1;
  if (item.daysLeft <= 7) return 7;
  return item.kind === "domain" && item.autoRenew ? null : 30;
}
