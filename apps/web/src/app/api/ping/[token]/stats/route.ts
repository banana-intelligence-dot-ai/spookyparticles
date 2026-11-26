import { connection } from "next/server";
import { parseStats, recordStats } from "@/lib/checkin-stats";
import { pingUnavailable } from "@/lib/ping-unavailable";

type Ctx = { params: Promise<{ token: string }> };
const headers = { "content-type": "application/json", "cache-control": "no-store" };

export async function POST(req: Request, ctx: Ctx) {
  await connection();
  const { token } = await ctx.params;
  let raw: unknown;
  try {
    const body = await req.text();
    if (body.length > 4_000) return new Response(JSON.stringify({ ok: false, reason: "bad_stats", error: "Body is too long" }), { status: 413, headers });
    raw = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "bad_stats", error: "Invalid JSON" }), { status: 400, headers });
  }
  const parsed = parseStats(raw, Date.now());
  if (!parsed.ok) return new Response(JSON.stringify({ ok: false, reason: "bad_stats", error: parsed.error }), { status: 400, headers });
  try {
    const result = await recordStats(token, parsed.value);
    if (!result.ok) return new Response(JSON.stringify({ ok: false, reason: "unknown" }), { status: 200, headers });
    return new Response(JSON.stringify({ ok: true, day: parsed.value.day }), { status: 200, headers });
  } catch (e) {
    return pingUnavailable(e, token, headers);
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: false, hint: "POST JSON to this ending" }), { status: 405, headers });
}
