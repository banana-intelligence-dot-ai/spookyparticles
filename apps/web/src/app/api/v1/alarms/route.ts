/**
 * Mark checks that deliberately fail when something in the real world needs attention.
 * GET /api/v1/alarms lists alarm checks.
 * POST {"project":"owner/repo","check":"Watch visual coverage","note":"30% floor"} marks one.
 * DELETE with the same project and check clears it. Every change is an event plus an audit line.
 */
import { alarmInput, alarmsFor, setAlarm } from "@/lib/alarms";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json({ alarms: await alarmsFor(actor.userId) });
});

async function handle(req: Request, on: boolean) {
  const actor = await requireActor(req, "write");
  return json(await setAlarm(actor, alarmInput((await req.json().catch(() => null)) as Record<string, unknown> | null), on));
}

export const POST = api((req) => handle(req, true));
export const DELETE = api((req) => handle(req, false));
