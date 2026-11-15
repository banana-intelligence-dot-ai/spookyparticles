/**
 * Stop watching a project, or one kind of notice on it.
 * GET /api/v1/mutes: what is muted now.
 * POST {"project": "owner/repo", "kind": "all"|"deploy"|"job"|"site"|"server_errors"|"check", "reason": "..."}: mute.
 * DELETE with the same project and kind: watch it again.
 * A mute stops pings, the agent inbox and open items for it. History keeps what happened. Every
 * change is an event plus an audit line; nothing is deleted and nothing is written to a host.
 */
import { api, json } from "@/lib/http";
import { muteInput, mutesFor, setMuted } from "@/lib/mutes";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json({ mutes: await mutesFor(actor.userId) });
});

async function handle(req: Request, muted: boolean) {
  const actor = await requireActor(req, "write");
  return json(await setMuted(actor, muteInput((await req.json().catch(() => null)) as Record<string, unknown> | null), muted));
}

export const POST = api((req) => handle(req, true));
export const DELETE = api((req) => handle(req, false));
