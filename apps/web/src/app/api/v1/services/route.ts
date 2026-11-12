import { listServices, recordService } from "@/lib/services/store";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => json(await listServices((await requireActor(req, "read")).userId)));
export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const input = await req.json().catch(() => { throw new ApiError(400, "invalid_json", "Send a JSON object"); });
  return json(await recordService(actor, input), { status: 201 });
});
