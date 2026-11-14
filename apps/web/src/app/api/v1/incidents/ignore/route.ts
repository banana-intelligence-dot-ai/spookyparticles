/**
 * POST /api/v1/incidents/ignore {key, project}: stop counting one failed deploy. DELETE with the
 * same body undoes it. Needs the "write" scope, so a read-only agent key can recommend ignoring
 * but only the owner (or a key they gave write) can do it. Writes only to Spooky.
 */
import { ignoreInput, setIgnored } from "@/lib/ignores";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

async function handle(req: Request, ignored: boolean) {
  const actor = await requireActor(req, "write");
  const { key, project } = ignoreInput((await req.json().catch(() => null)) as { key?: unknown; project?: unknown } | null);
  return json(await setIgnored(actor, key, project, ignored));
}

export const POST = api((req) => handle(req, true));
export const DELETE = api((req) => handle(req, false));
