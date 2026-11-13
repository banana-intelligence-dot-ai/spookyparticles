/** GET /api/v1/checkins/history: each scheduled job's last 14 days of check-ins (hourly counts) and every miss Spooky caught, with when it came back. Read only. */
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";
import { runHistoryFor } from "@/lib/run-history";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json(await runHistoryFor(actor.userId));
});
