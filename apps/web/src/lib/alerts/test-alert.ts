import type { Actor } from "@/lib/actor";
import { appendAudit } from "@/lib/audit";
import { notifyDeployFailed } from "./deploy-failed";
import { mailerConfigured } from "./email";
import { ApiError } from "@/lib/http";

export async function sendTestAlert(actor: Actor) {
  if (!mailerConfigured()) throw new ApiError(503, "not_configured", "Email is not set up on this deployment yet.");
  const hour = new Date().toISOString().slice(0, 13);
  const result = await notifyDeployFailed(actor.userId, {
    deploymentId: `test-${hour}`, project: "spooky-particles/test-alert", environment: "production", host: "Vercel", at: new Date().toISOString(),
    cause: "Type error: this is a test alert from Spooky Particles. Nothing failed.",
    logTail: ["Running \"npm run build\"", "> next build", "   Creating an optimized production build ...", "Failed to compile.", "./src/app/page.tsx:12:5", "Type error: this is a test alert from Spooky Particles. Nothing failed.", "Error: Command \"npm run build\" exited with 1"],
    inspectorUrl: null, url: null,
  });
  if (result !== "skipped") await appendAudit({ actor: actor.label, userId: actor.userId, action: "alert.test_sent", target: `user:${actor.userId}`, after: { result } });
  return { result, note: result === "skipped" ? "A test was already sent this hour, or deploy-failure emails are turned off for this account." : undefined };
}
