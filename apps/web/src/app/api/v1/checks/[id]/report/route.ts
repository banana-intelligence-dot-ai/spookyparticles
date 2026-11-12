import { reportAttempt } from "@/lib/checks/handoff-store";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "not_found", "No such finding");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_body", "Send a JSON object");
  return json(await reportAttempt(actor, { findingId: id, outcome: body.outcome, prUrl: body.prUrl, note: body.note }));
});
