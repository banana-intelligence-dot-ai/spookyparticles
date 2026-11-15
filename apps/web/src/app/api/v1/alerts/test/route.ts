/**
 * POST /api/v1/alerts/test: send yourself one sample failed-deploy email, so the path from
 * Resend to your inbox is proven before a real failure needs it. Same renderer, same
 * dedupe table, same opt-out link; the sample is marked as a test in its subject line.
 * At most one per hour per account.
 */
import { sendTestAlert } from "@/lib/alerts/test-alert";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  return json(await sendTestAlert(actor));
});
