import { ApiError, api, json } from "@/lib/http";
import { pushCheckFor, pushCheckInput } from "@/lib/push-check";
import { requireActor } from "@/lib/require-actor";

export const maxDuration = 30;

/**
 * GET /api/v1/push-check?repo=owner/repo&sha=abc1234&path=/pricing&expectText=New+plans
 * Did the push go live: the newest deploy per environment, whether the commit is live in production,
 * and whether the production page answers 200 and shows the text. Same answer as the MCP tool did_my_push_land.
 */
export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  const q = new URL(req.url).searchParams;
  const raw: Record<string, unknown> = {};
  for (const key of ["repo", "sha", "path", "expectText"]) if (q.has(key)) raw[key] = q.get(key);
  let input;
  try { input = pushCheckInput(raw); } catch (error) { throw new ApiError(400, "bad_request", (error as Error).message); }
  try { return json(await pushCheckFor(actor.userId, input)); } catch (error) {
    if ((error as Error).message === "Unknown repo") throw new ApiError(404, "not_found", "Unknown repo");
    throw error;
  }
});
