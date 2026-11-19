/**
 * The check-in link's shared handler. GET or POST https://spookyparticles.com/api/ping/<token>
 *   ?status=ok (default) | start | fail, and an optional short note as the POST body or ?note=
 * Healthchecks-style endings work too, so backup and cron tools that already speak that format
 * can use the link as is: <link>/start, <link>/fail, and <link>/<exit code> (0 is ok, 1 to 255 fail).
 * The token is the only credential. Unknown tokens answer 200 with ok: false, so a probe
 * learns nothing. Never cached; the token is never logged.
 * If Spooky cannot save the check-in (database down), it answers 503 with Retry-After.
 */
import { connection } from "next/server";
import { cleanCount, recordPing, type PingKind } from "@/lib/checkins";
import { pingUnavailable } from "@/lib/ping-unavailable";

const KINDS = new Set<string>(["ok", "start", "fail"]);

/** Pure: what a healthchecks-style ending means. Null for an ending we do not know. */
export function pingSuffixKind(suffix: string): { kind: PingKind; note: string | null } | null {
  const s = suffix.toLowerCase();
  if (s === "start" || s === "fail") return { kind: s, note: null };
  if (/^\d{1,3}$/.test(s)) {
    const code = Number(s);
    if (code > 255) return null;
    return code === 0 ? { kind: "ok", note: null } : { kind: "fail", note: `exit code ${code}` };
  }
  return null;
}

export async function handlePing(req: Request, token: string, forced: { kind: PingKind; note: string | null } | null = null) {
  await connection();
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "ok").toLowerCase();
  const kind: PingKind = forced?.kind ?? (KINDS.has(status) ? (status as PingKind) : "ok");
  let note = url.searchParams.get("note");
  if (req.method === "POST" && !note) {
    try {
      const body = (await req.text()).trim();
      if (body) note = body.slice(0, 2_000);
    } catch {
      /* no note */
    }
  }
  note = note ?? forced?.note ?? null;
  const count = cleanCount(url.searchParams.get("count"));
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  let r: Awaited<ReturnType<typeof recordPing>>;
  try {
    r = await recordPing(token, kind, note, Date.now(), count);
  } catch (e) {
    return pingUnavailable(e, token, headers);
  }
  if (!r.ok) return new Response(JSON.stringify({ ok: false, reason: r.reason }), { status: 200, headers });
  return new Response(JSON.stringify({ ok: true, job: r.job.name, status: r.job.status, nextDueAt: r.job.nextDueAt, recovered: r.recovered }), { status: 200, headers });
}
