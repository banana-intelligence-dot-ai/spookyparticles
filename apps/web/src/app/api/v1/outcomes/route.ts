/** GET /api/v1/outcomes: what Spooky observed for one commit. */
import { commitOutcomeFor } from "@/lib/commit-outcome";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? "";
  const sha = url.searchParams.get("sha") ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.length > 120) throw new ApiError(400, "bad_request", "repo must be owner/repo");
  if (!/^[a-fA-F0-9]{7,40}$/.test(sha)) throw new ApiError(400, "bad_request", "sha must be a 7 to 40 character commit hash");
  return json(await commitOutcomeFor(actor.userId, repo, sha));
});
