/**
 * Healthchecks-style endings on the check-in link: /start, /fail, /<exit code>.
 * /status is its own read-only route and wins over this one.
 */
import { handlePing, pingSuffixKind } from "@/lib/ping-handler";

type Ctx = { params: Promise<{ token: string; suffix: string }> };

async function handle(req: Request, ctx: Ctx) {
  const { token, suffix } = await ctx.params;
  const forced = pingSuffixKind(suffix);
  if (!forced) {
    return new Response(JSON.stringify({ ok: false, reason: "unknown_ending", hint: "Use /start, /fail, /<exit code> or ?status=" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return handlePing(req, token, forced);
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}
export async function POST(req: Request, ctx: Ctx) {
  return handle(req, ctx);
}
