/**
 * POST /api/v1/vendors/{vendorKey}/scope with { scope: "work" | "personal" }.
 * The user's own call on a vendor: it wins over the shared verdict, sticks
 * through recomputes, and is audited. Findings recompute right away.
 */
import { setVendorScope } from "@/lib/findings";
import { api, ApiError, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ vendorKey: string }> };

export const POST = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req, "write");
  const { vendorKey } = await ctx.params;
  if (!/^[a-z0-9]{1,80}$/.test(vendorKey)) throw new ApiError(400, "bad_request", "vendorKey is lowercase letters and digits");
  const body = (await req.json().catch(() => null)) as { scope?: unknown } | null;
  const scope = body?.scope;
  if (scope !== "work" && scope !== "personal") throw new ApiError(400, "bad_request", 'scope must be "work" or "personal"');
  return json(await setVendorScope(actor.userId, vendorKey, scope, actor.label));
});
