import { setCheckDismissed } from "@/lib/checks/dismiss";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
async function change(req: Request, ctx: Ctx, dismiss: boolean) {
  const actor = await requireActor(req, "write");
  return json(await setCheckDismissed(actor, (await ctx.params).id, dismiss));
}
export const POST = api<Ctx>((req, ctx) => change(req, ctx, true));
export const DELETE = api<Ctx>((req, ctx) => change(req, ctx, false));
