/**
 * Alert channels: where quiet-job and failed-deploy alerts go.
 * GET lists them masked. POST { kind: ntfy|slack|teams|email, target } adds one; targets are
 * encrypted at rest and never returned. Session only for POST: a webhook URL is a credential,
 * and the human pastes it, not an agent.
 */
import { addChannel, cleanChannelProject, listChannels, type ChannelKind } from "@/lib/alerts/channels";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

const KINDS: ChannelKind[] = ["ntfy", "slack", "teams", "email"];

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json({ channels: await listChannels(actor.userId) });
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  if (actor.via !== "session") throw new ApiError(403, "session_required", "Add alert channels from a signed-in session");
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; target?: unknown; project?: unknown };
  const kind = KINDS.find((k) => k === body.kind);
  if (!kind) throw new ApiError(400, "kind", "kind: ntfy, slack, teams or email");
  if (typeof body.target !== "string" || !body.target.trim()) throw new ApiError(400, "target", "target is required");
  if (body.project != null && typeof body.project !== "string") throw new ApiError(400, "project", "project: up to 120 characters");
  const r = await addChannel(actor.userId, kind, body.target, cleanChannelProject(body.project));
  if (!r.ok) throw new ApiError(400, "target", r.reason);
  return json({ channel: r.channel }, { status: 201 });
});
