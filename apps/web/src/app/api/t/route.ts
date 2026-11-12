/**
 * POST /api/t: the browser's usage events, cookieless. Body: { event, ref?, utm_source?,
 * utm_campaign?, path?, props? }. Only the events in CLIENT_EVENTS are accepted; the funnel
 * steps that matter (signed up, connected, key made) are written by the server where they
 * happen. A signed-in session attaches the user id and, once, remembers their first tag.
 * No IP, no user agent, no cookie is stored. Answers 204 whatever happens.
 */
import { connection } from "next/server";
import { CLIENT_EVENTS, cleanArrival, recordUsage, rememberArrival } from "@/lib/analytics/usage";
import { getAuth } from "@/lib/auth";

const MAX_BODY = 2_000;

export async function POST(req: Request) {
  await connection();
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response(null, { status: 204 });
    const body = JSON.parse(raw) as { event?: unknown; props?: unknown } & Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event : "";
    if (!CLIENT_EVENTS.has(event)) return new Response(null, { status: 204 });
    const arrival = cleanArrival(body);
    const session = await getAuth().api.getSession({ headers: req.headers }).catch(() => null);
    const userId = session?.user.id ?? null;
    const props: Record<string, string | number | boolean | null> = {};
    if (body.props && typeof body.props === "object") {
      for (const [k, v] of Object.entries(body.props as Record<string, unknown>).slice(0, 8)) {
        if (/^[a-z_]{1,32}$/.test(k) && (typeof v === "string" ? v.length <= 120 : typeof v === "number" || typeof v === "boolean" || v === null)) props[k] = v as string | number | boolean | null;
      }
    }
    if (userId && event === "signed_in") await rememberArrival(userId, arrival);
    await recordUsage({ event, userId, arrival, props });
  } catch {
    // A malformed beacon is not worth a log line.
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
