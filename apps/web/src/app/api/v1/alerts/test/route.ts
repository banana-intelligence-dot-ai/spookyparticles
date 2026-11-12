/**
 * POST /api/v1/alerts/test: send yourself one sample failed-deploy email, so the path from
 * Resend to your inbox is proven before a real failure needs it. Same renderer, same
 * dedupe table, same opt-out link; the sample is marked as a test in its subject line.
 * At most one per hour per account.
 */
import { notifyDeployFailed } from "@/lib/alerts/deploy-failed";
import { mailerConfigured } from "@/lib/alerts/email";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const POST = api(async (req) => {
  const actor = await requireActor(req);
  if (!mailerConfigured()) throw new ApiError(503, "not_configured", "Email is not set up on this deployment yet.");
  const hour = new Date().toISOString().slice(0, 13);
  const result = await notifyDeployFailed(actor.userId, {
    deploymentId: `test-${hour}`,
    project: "spooky-particles/test-alert",
    environment: "production",
    host: "Vercel",
    at: new Date().toISOString(),
    cause: "Type error: this is a test alert from Spooky Particles. Nothing failed.",
    logTail: ["Running \"npm run build\"", "> next build", "   Creating an optimized production build ...", "Failed to compile.", "./src/app/page.tsx:12:5", "Type error: this is a test alert from Spooky Particles. Nothing failed.", "Error: Command \"npm run build\" exited with 1"],
    inspectorUrl: null,
    url: null,
  });
  return json({ result, note: result === "skipped" ? "A test was already sent this hour, or deploy-failure emails are turned off for this account." : undefined });
});
