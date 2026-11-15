/**
 * GET /api/v1/public/fixes: the anonymized fix feed on the homepage. No sign-in. Only accounts
 * that turned the feed on, and only a time, a kind of break and minutes to fix per row.
 * Cached at the edge for two minutes so the homepage never loads the database per visit.
 */
import { api, json } from "@/lib/http";
import { publicFeed } from "@/lib/public-fixes";

export const GET = api(async () => {
  return json(await publicFeed(), {
    headers: { "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" },
  });
});
