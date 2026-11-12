/** The sole customer-token POST endpoint: two read-only request-count query shapes. */
import type { VercelScope } from "./vercel";
import type { RunEvidence } from "@/lib/vercel-schedules";

const QUERY_URL = "https://api.vercel.com/v2/observability/query";
const MAX_WINDOW_MS = 2 * 60 * 60_000;
/** Vercel caps `limit` at 500 (checked live 2026-11-10; a larger value is a 400). It counts groups (path x status), not rows. */
const MAX_GROUPS = 500;

export function buildRequestCountQuery(scope: VercelScope, projectId: string, paths: string[], sinceMs: number, untilMs: number) {
  if (!projectId || paths.length < 1 || paths.length > 40 || paths.some((p) => !p.startsWith("/") || p.length > 512 || /[\x00-\x1f\x7f]/.test(p))) throw new Error("invalid request paths");
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs >= untilMs) throw new Error("invalid query window");
  return {
    metric: "vercel.request.count",
    scope: { type: "project", ownerId: scope.id, projectIds: [projectId] },
    aggregation: "sum",
    filter: `(${[...new Set(paths)].map((p) => `request_path eq '${p.replace(/'/g, "''")}'`).join(" or ")}) and client_user_agent eq 'vercel-cron/1.0'`,
    groupBy: ["request_path", "http_status"],
    granularity: { minutes: 1 },
    startTime: new Date(Math.max(sinceMs, untilMs - MAX_WINDOW_MS)).toISOString(),
    endTime: new Date(untilMs).toISOString(),
    limit: MAX_GROUPS,
  };
}

export function buildErrorRateQuery(scope: VercelScope, projectId: string, sinceMs: number, untilMs: number) {
  if (!projectId || !Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs >= untilMs) throw new Error("invalid error query");
  return {
    metric: "vercel.request.count",
    scope: { type: "project", ownerId: scope.id, projectIds: [projectId] },
    aggregation: "sum",
    // Production only (verified live 2026-11-10 that the dimension exists): a broken preview is not an outage.
    filter: "environment eq 'production'",
    groupBy: ["http_status"],
    granularity: { minutes: 5 },
    startTime: new Date(Math.max(sinceMs, untilMs - 15 * 60_000)).toISOString(),
    endTime: new Date(untilMs).toISOString(),
    limit: MAX_GROUPS,
  };
}

export function summariseStatusCounts(body: unknown): { total: number; serverErrors: number } {
  let total = 0;
  let serverErrors = 0;
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) return { total, serverErrors };
  for (const raw of (body as { data: unknown[] }).data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const status = typeof row.http_status === "string" && /^\d{3}$/.test(row.http_status) ? Number(row.http_status) : NaN;
    const count = row.vercel_request_count_sum;
    if (!Number.isInteger(status) || status < 100 || status > 599 || typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    total += count;
    if (status >= 500) serverErrors += count;
  }
  return { total, serverErrors };
}

export async function queryErrorRate(token: string, scope: VercelScope, projectId: string, sinceMs: number, untilMs: number): Promise<{ ok: true; counts: { total: number; serverErrors: number } } | { ok: false; reason: "not_readable" | "unavailable" }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const body = buildErrorRateQuery(scope, projectId, sinceMs, untilMs);
    const url = new URL(QUERY_URL);
    if (scope.kind === "team" && scope.id !== "scoped") url.searchParams.set("teamId", scope.id);
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if ([401, 403, 404].includes(response.status)) return { ok: false, reason: "not_readable" };
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !Array.isArray((result as { data?: unknown }).data)) return { ok: false, reason: "unavailable" };
    return { ok: true, counts: summariseStatusCounts(result) };
  } catch { return { ok: false, reason: "unavailable" }; }
  finally { clearTimeout(timeout); }
}

export function parseRequestCounts(body: unknown): RunEvidence[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) return [];
  const out: RunEvidence[] = [];
  for (const raw of (body as { data: unknown[] }).data) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const atMs = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    const status = typeof row.http_status === "string" && /^\d{3}$/.test(row.http_status) ? Number(row.http_status) : NaN;
    if (!Number.isFinite(atMs) || typeof row.request_path !== "string" || !row.request_path.startsWith("/") || !Number.isInteger(status) || status < 100 || status > 599 || typeof row.vercel_request_count_sum !== "number" || !Number.isFinite(row.vercel_request_count_sum) || row.vercel_request_count_sum <= 0) continue;
    out.push({ atMs, path: row.request_path, status });
  }
  return out;
}

export async function queryRequestCounts(token: string, scope: VercelScope, projectId: string, paths: string[], sinceMs: number, untilMs: number): Promise<{ ok: true; evidence: RunEvidence[] } | { ok: false; reason: "not_readable"; status: number } | { ok: false; reason: "unavailable" }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const body = buildRequestCountQuery(scope, projectId, paths, sinceMs, untilMs);
    const url = new URL(QUERY_URL);
    if (scope.kind === "team" && scope.id !== "scoped") url.searchParams.set("teamId", scope.id);
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    // 429 is a rate limit, not a refusal: try again next sweep instead of telling the user their history is closed.
    if (response.status === 429) return { ok: false, reason: "unavailable" };
    // Only a refusal means the history is closed to this token. Any other 4xx is our request being wrong:
    // say so in the log (status only, never the body) and retry next sweep instead of blaming the user's plan.
    if (response.status === 401 || response.status === 403 || response.status === 404) return { ok: false, reason: "not_readable", status: response.status };
    if (response.status >= 400 && response.status < 500) {
      console.error("[vercel-query] request rejected", response.status);
      return { ok: false, reason: "unavailable" };
    }
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !Array.isArray((result as { data?: unknown }).data)) return { ok: false, reason: "unavailable" };
    return { ok: true, evidence: parseRequestCounts(result) };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
