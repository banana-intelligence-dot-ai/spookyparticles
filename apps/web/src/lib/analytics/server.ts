/**
 * Server-side events. Every event is counted first party in usage_events (cookieless); PostHog gets a copy only when NEXT_PUBLIC_POSTHOG_KEY is set.
 */
import { PostHog } from "posthog-node";
import { analyticsEnabled, type AnalyticsEventName, type AnalyticsEvents } from "./events";
import { recordUsage } from "./usage";

/** Events whose provider makes them separate funnel steps in the stats read. */
const SPLIT_BY_PROVIDER = new Set<string>(["consent_granted", "consent_screen_shown", "consent_abandoned"]);

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!analyticsEnabled()) return null;
  client ??= new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    // Serverless: send immediately rather than batching in memory.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export async function track<E extends AnalyticsEventName>(
  distinctId: string,
  event: E,
  properties: AnalyticsEvents[E],
): Promise<void> {
  const p = properties as Record<string, unknown>;
  const name = SPLIT_BY_PROVIDER.has(event) && typeof p.provider === "string" ? `${event}:${p.provider}` : event;
  const small: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) small[k] = typeof v === "string" ? v.slice(0, 120) : v;
  await recordUsage({ event: name, userId: distinctId.startsWith("user:") ? distinctId.slice(5) : distinctId, props: small });
  const c = getClient();
  if (!c) return;
  try {
    c.capture({ distinctId, event, properties });
    await c.flush();
  } catch (err) {
    console.error("[analytics] capture failed", event, (err as Error).message);
  }
}
