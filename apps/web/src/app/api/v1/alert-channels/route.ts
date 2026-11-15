/**
 * Alert channels: where quiet-job and failed-deploy alerts go.
 * GET lists them masked. POST { kind: ntfy|slack|teams|email|github, target } adds one (github: owner/repo, a fix-job responder, only while the pager is on); targets are
 * encrypted at rest and never returned.
 */
import { addChannel, cleanChannelProject, listChannels, type ChannelKind } from "@/lib/alerts/channels";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";
import { pagerEnabled } from "@/lib/pager";

const KINDS: ChannelKind[] = ["ntfy", "slack", "teams", "email", "github"];

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  return json({ channels: await listChannels(actor.userId) });
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; target?: unknown; project?: unknown };
  const kind = KINDS.find((k) => k === body.kind);
  if (!kind) throw new ApiError(400, "kind", pagerEnabled() ? "kind: ntfy, slack, teams, email or github" : "kind: ntfy, slack, teams or email");
  if (typeof body.target !== "string" || !body.target.trim()) throw new ApiError(400, "target", "target is required");
  if (body.project != null && typeof body.project !== "string") throw new ApiError(400, "project", "project: up to 120 characters");
  const r = await addChannel(actor.userId, kind, body.target, cleanChannelProject(body.project) ?? (kind === "github" ? body.target.trim() : null), actor.label);
  if (!r.ok) throw new ApiError(400, "target", r.reason);
  return json({ channel: r.channel }, { status: 201 });
});
