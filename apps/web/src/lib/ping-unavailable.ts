/**
 * The answer a check-in link gives when Spooky cannot reach its database: 503 with Retry-After,
 * so the job sees "Spooky is down, try again" rather than an error that looks like its own.
 * A failed query's message carries the token as a parameter, so only the cause is logged, scrubbed.
 */
export function pingUnavailable(e: unknown, token: string, headers: Record<string, string>): Response {
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "unknown";
  console.error(`[ping] database unavailable: ${cause.split(token).join("[token]").slice(0, 300)}`);
  return new Response(JSON.stringify({ ok: false, reason: "unavailable" }), { status: 503, headers: { ...headers, "retry-after": "60" } });
}
