"use client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { isNoTrack } from "./notrack";

/** Drops the visit for browsers opened once with ?notrack=1, and keeps "notrack" out of any URL that is counted. */
function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (isNoTrack()) return null;
  try {
    const url = new URL(event.url);
    if (!url.searchParams.has("notrack")) return event;
    url.searchParams.delete("notrack");
    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

/** Vercel Web Analytics with the notrack switch. */
export function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
