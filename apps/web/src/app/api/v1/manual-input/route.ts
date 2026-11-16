/** GET /api/v1/manual-input?days=7: steps a person took by hand versus steps agents and Spooky took. Any manual input is error. */
import { api, json } from "@/lib/http";
import { clampDays, manualInputFor } from "@/lib/manual-input";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await manualInputFor(actor.userId, clampDays(new URL(req.url).searchParams.get("days") ?? undefined)));
});
