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
export type TrackedExpirationKind = "api_key" | "token" | "certificate" | "other";
export type TrackedExpirationRow = {
  id: string;
  kind: TrackedExpirationKind;
  name: string;
  provider: string | null;
  hint: string | null;
  project: string | null;
  expiresOn: string;
};
export type SpookyKeyExpirationRow = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: Date | string;
};
export type Expiration = {
  kind: "node_runtime" | "domain" | TrackedExpirationKind | "spooky_key";
  name: string;
  date: string;
  daysLeft: number;
  id?: string;
  provider?: string;
  hint?: string;
  project?: string;
  autoRenew?: boolean;
};

const day = 86_400_000;
const dateOnly = (value: unknown): string | null => {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};
const startOfToday = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const daysUntil = (date: string, now: Date) => Math.round((Date.parse(date) - startOfToday(now)) / day);
const sortExpirations = (items: Expiration[]) => items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

/** Dated facts only. A project-domain row without a registrar date is reported separately as unknown. */
export function expirations(nodes: ExpirationNode[], now = new Date()): Expiration[] {
  const items: Expiration[] = [];
  for (const node of nodes) {
    if (node.kind === "project" && node.attributes.provider === "vercel") {
      const version = node.attributes.node_version;
      const date = typeof version === "string" ? RUNTIME_DEPRECATIONS[version] : undefined;
      if (date) items.push({ kind: "node_runtime", name: `Node.js ${version}`, project: node.name, date, daysLeft: daysUntil(date, now) });
    }
    if (node.kind === "domain" && node.attributes.provider === "vercel") {
      const date = dateOnly(node.attributes.expires_at);
      if (date) items.push({ kind: "domain", name: node.name, date, daysLeft: daysUntil(date, now), ...(typeof node.attributes.auto_renew === "boolean" ? { autoRenew: node.attributes.auto_renew } : {}) });
    }
  }
  return sortExpirations(items);
}

export function trackedExpirations(rows: TrackedExpirationRow[], now = new Date()): Expiration[] {
  return sortExpirations(rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    date: row.expiresOn,
    daysLeft: daysUntil(row.expiresOn, now),
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.hint ? { hint: row.hint } : {}),
    ...(row.project ? { project: row.project } : {}),
  })));
}

export function spookyKeyExpirations(rows: SpookyKeyExpirationRow[], now = new Date()): Expiration[] {
  return sortExpirations(rows.flatMap((row) => {
    const date = dateOnly(row.expiresAt);
    return date ? [{ id: row.id, kind: "spooky_key" as const, name: row.name, provider: "Spooky", hint: row.prefix, date, daysLeft: daysUntil(date, now) }] : [];
  }));
}

export function mergeExpirations(
  nodes: ExpirationNode[],
  tracked: TrackedExpirationRow[],
  spookyKeys: SpookyKeyExpirationRow[],
  now = new Date(),
): Expiration[] {
  return sortExpirations([...expirations(nodes, now), ...trackedExpirations(tracked, now), ...spookyKeyExpirations(spookyKeys, now)]);
}

/** The current alert window. A sweep can arrive late without backfilling earlier windows. */
export function alertThreshold(item: Expiration): 30 | 7 | 1 | null {
  if (item.daysLeft < 1 || item.daysLeft > 30) return null;
  if (item.daysLeft <= 1) return 1;
  if (item.daysLeft <= 7) return 7;
  return item.kind === "domain" && item.autoRenew ? null : 30;
}
