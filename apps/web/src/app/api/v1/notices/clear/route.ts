/**
 * Clear one notice from the open list, without muting what comes next.
 * GET /api/v1/notices/clear: the notices that stand cleared, newest first.
 * POST {"key": "..."} or {"keys": ["..."], "project": "owner/repo", "what": "the notice's words"}: clear.
 * DELETE with the same key or keys: bring it back.
 * Keys come from GET /api/v1/open (clearKeys). Every change is an event plus an audit line;
 * nothing is deleted and nothing is written to a host.
 */
import { api, json } from "@/lib/http";
import { clearInput, clearedFor, setCleared } from "@/lib/ignores";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json({ cleared: await clearedFor(actor.userId) });
});

async function handle(req: Request, cleared: boolean) {
  const actor = await requireActor(req, "write");
  return json(await setCleared(actor, clearInput((await req.json().catch(() => null)) as Record<string, unknown> | null), cleared));
}

export const POST = api((req) => handle(req, true));
export const DELETE = api((req) => handle(req, false));
