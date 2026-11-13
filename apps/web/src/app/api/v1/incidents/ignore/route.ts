/**
 * POST /api/v1/incidents/ignore {key, project}: stop counting one failed deploy. DELETE with the
 * same body undoes it. Needs the "write" scope, so a read-only agent key can recommend ignoring
 * but only the owner (or a key they gave write) can do it. Writes only to Spooky.
 */
import { setIgnored } from "@/lib/ignores";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

async function handle(req: Request, ignored: boolean) {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => null)) as { key?: unknown; project?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const project = typeof body?.project === "string" ? body.project.trim().slice(0, 120) : "";
  if (!key || key.length > 200) throw new ApiError(400, "key_required", "Send the break's key from the project's deployments.");
  return json(await setIgnored(actor, key, project, ignored));
}

export const POST = api((req) => handle(req, true));
export const DELETE = api((req) => handle(req, false));
