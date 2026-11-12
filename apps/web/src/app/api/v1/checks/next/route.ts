import { takeNext } from "@/lib/checks/handoff-store";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => json(await takeNext(await requireActor(req, "write"))));
