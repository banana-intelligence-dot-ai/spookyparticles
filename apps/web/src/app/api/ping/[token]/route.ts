/**
 * The check-in link. GET or POST https://spookyparticles.com/api/ping/<token>
 *   ?status=ok (default) | start | fail, and an optional short note as the POST body or ?note=
 * The token is the only credential. Unknown tokens answer 200 with ok: false, so a probe
 * learns nothing. Never cached; the token is never logged.
 */
import { connection } from "next/server";
import { cleanCount, recordPing, type PingKind } from "@/lib/checkins";

const KINDS = new Set<string>(["ok", "start", "fail"]);

async function handle(req: Request, params: Promise<{ token: string }>) {
  await connection();
  const { token } = await params;
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "ok").toLowerCase();
  const kind: PingKind = KINDS.has(status) ? (status as PingKind) : "ok";
  let note = url.searchParams.get("note");
  if (req.method === "POST" && !note) {
    try {
      const body = (await req.text()).trim();
      if (body && body.length <= 2_000) note = body;
    } catch {
      /* no note */
    }
  }
  const count = cleanCount(url.searchParams.get("count"));
  const r = await recordPing(token, kind, note, Date.now(), count);
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (!r.ok) return new Response(JSON.stringify({ ok: false, reason: r.reason }), { status: 200, headers });
  return new Response(JSON.stringify({ ok: true, job: r.job.name, status: r.job.status, nextDueAt: r.job.nextDueAt, recovered: r.recovered }), { status: 200, headers });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, ctx.params);
}
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, ctx.params);
}
