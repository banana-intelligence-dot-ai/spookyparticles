/**
 * POST /api/v1/checks/{id}/merge: let your own agent merge the pull request it opened for this
 * low-risk finding, after every check on it passes. DELETE takes the yes back. Spooky never merges;
 * your agent does, with its own GitHub login. Needs the web app or a full control key. Audited.
 */
import { allowMerge } from "@/lib/checks/handoff-store";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ id: string }> };
async function change(req: Request, ctx: Ctx, allow: boolean) {
  const actor = await requireActor(req, "approve");
  return json(await allowMerge(actor, (await ctx.params).id, allow));
}
export const POST = api<Ctx>((req, ctx) => change(req, ctx, true));
export const DELETE = api<Ctx>((req, ctx) => change(req, ctx, false));
