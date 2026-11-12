import { findingsReport } from "@/lib/checks/handoff-store";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await findingsReport(actor.userId));
});
