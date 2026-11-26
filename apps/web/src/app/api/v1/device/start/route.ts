/** Agent sign-in, step 1: no auth. Returns a secret deviceCode for the script and a userCode for the human. */
import { after } from "next/server";
import { recordUsage } from "@/lib/analytics/usage";
import { deviceHandlers } from "@/lib/device-auth-db";
import { api } from "@/lib/http";

export const POST = api(async (req) => {
  const response = await deviceHandlers.start(req);
  after(async () => {
    try {
      await recordUsage({ event: "agent_signin_started" });
    } catch {
      // Counting must never break the device-code response.
    }
  });
  return response;
});
