import { cancelDeletion, deletionStatus, scheduleDeletion } from "@/lib/account-deletion";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

/** Schedule deletion in seven days, revoking connections now. */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "approve");
  return json(await scheduleDeletion(actor, await req.json().catch(() => ({}))), { status: 202 });
});

export const DELETE = api(async (req) => json(await cancelDeletion(await requireActor(req, "approve"))));

export const GET = api(async (req) => json(await deletionStatus(await requireActor(req))));
