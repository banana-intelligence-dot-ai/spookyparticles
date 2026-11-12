/**
 * GET https://spookyparticles.com/api/ping/<token>/status: read one job's state with its own
 * check-in link, so the job (or the agent that set it up) can confirm its pings land without an
 * account key. Read-only: it never records a check-in. It shows only that job, never the account.
 * Unknown tokens answer 200 with ok: false, like the ping itself. Never cached; the token is never logged.
 */
import { connection } from "next/server";
import { jobStatusByToken } from "@/lib/checkins";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await ctx.params;
  const job = await jobStatusByToken(token);
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (!job) return new Response(JSON.stringify({ ok: false, reason: "unknown" }), { status: 200, headers });
  return new Response(JSON.stringify({ ok: true, ...job }), { status: 200, headers });
}
