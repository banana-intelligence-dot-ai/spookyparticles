/**
 * GET /api/v1/public/fixes: the anonymized fix feed on the homepage. No sign-in. Only accounts
 * that turned the feed on, and only a time, a kind of break and minutes to fix per row.
 * Cached at the edge for two minutes so the homepage never loads the database per visit.
 */
import { api, json } from "@/lib/http";
import { publicFeed } from "@/lib/public-fixes";

export const GET = api(async (req) => {
  const url = new URL(req.url);
  const beforeValue = url.searchParams.get("before");
  const beforeMs = beforeValue === null ? Number.NaN : Date.parse(beforeValue);
  const limitValue = url.searchParams.get("limit");
  const parsedLimit = limitValue === null ? Number.NaN : Number(limitValue);
  const before = Number.isFinite(beforeMs) ? new Date(beforeMs).toISOString() : undefined;
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, Math.trunc(parsedLimit))) : undefined;
  return json(await publicFeed({ before, limit }), {
    headers: { "cache-control": "public, max-age=60, s-maxage=600, stale-while-revalidate=1800" },
  });
});
