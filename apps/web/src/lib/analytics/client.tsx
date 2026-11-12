"use client";
/**
 * Browser-side measurement, cookieless.
 *
 * - On the first page of a visit, the link tag (?ref=, utm_source, utm_campaign) is kept in
 *   sessionStorage (not a cookie) and a "landed" beacon goes to /api/t.
 * - Clicks on links that leave the site send "outbound_clicked" with the destination host.
 * - `touch(event, props)` lets buttons report the few client steps the funnel needs.
 * - PostHog loads only when NEXT_PUBLIC_POSTHOG_KEY is set, with no cookie (localStorage).
 * Page views themselves are Vercel Web Analytics' job (root layout).
 */
import posthog from "posthog-js";
import { useEffect } from "react";
import type { AnalyticsEventName, AnalyticsEvents } from "./events";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const ARRIVAL = "sp.arrival";
const LANDED = "sp.landed";
let started = false;

type Arrival = { ref?: string; utm_source?: string; utm_campaign?: string; path?: string };

function readArrival(): Arrival {
  try {
    const raw = window.sessionStorage.getItem(ARRIVAL);
    return raw ? (JSON.parse(raw) as Arrival) : {};
  } catch {
    return {};
  }
}

/** The tag from the URL wins on the first page; after that the stored one is kept for the visit. */
function captureArrival(): Arrival {
  const stored = readArrival();
  const q = new URLSearchParams(window.location.search);
  const fresh: Arrival = {};
  for (const [from, to] of [["ref", "ref"], ["utm_source", "utm_source"], ["utm_campaign", "utm_campaign"]] as const) {
    const v = q.get(from);
    if (v) fresh[to] = v.slice(0, 40);
  }
  const next: Arrival = Object.keys(fresh).length && !stored.ref && !stored.utm_campaign ? { ...fresh, path: window.location.pathname } : stored;
  if (!next.path) next.path = window.location.pathname;
  try {
    window.sessionStorage.setItem(ARRIVAL, JSON.stringify(next));
  } catch {
    /* storage blocked: the visit just goes untagged */
  }
  return next;
}

function beacon(event: string, props: Record<string, string | number | boolean | null> = {}) {
  const a = readArrival();
  const body = JSON.stringify({ event, ref: a.ref, utm_source: a.utm_source, utm_campaign: a.utm_campaign, path: a.path ?? window.location.pathname, props });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/t", new Blob([body], { type: "application/json" }));
    else void fetch("/api/t", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* never let counting break the page */
  }
}

/** Report one of the client steps: signin_clicked, signed_in, setup_prompt_copied. */
export function touch(event: "signin_clicked" | "signed_in" | "setup_prompt_copied" | "move_to_vercel_clicked", props: Record<string, string | number | boolean | null> = {}) {
  if (typeof window === "undefined") return;
  beacon(event, props);
  if (KEY && started) posthog.capture(event, props);
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const arrival = captureArrival();
    try {
      if (!window.sessionStorage.getItem(LANDED)) {
        window.sessionStorage.setItem(LANDED, "1");
        beacon("landed", { referrer_host: document.referrer ? new URL(document.referrer).hostname : null });
      }
    } catch {
      beacon("landed", {});
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin || !/^https?:$/.test(url.protocol)) return;
      beacon("outbound_clicked", { host: url.hostname, path: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });

    if (KEY && !started) {
      posthog.init(KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: false,
        autocapture: false,
        // No cookie: the anonymous id lives in localStorage only, so no banner is owed.
        persistence: "localStorage",
      });
      started = true;
      if (arrival.ref || arrival.utm_campaign) posthog.register_once({ ref: arrival.ref ?? null, utm_source: arrival.utm_source ?? null, utm_campaign: arrival.utm_campaign ?? null });
    }
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return <>{children}</>;
}

export function trackClient<E extends AnalyticsEventName>(event: E, properties: AnalyticsEvents[E]) {
  if (!KEY || !started) return;
  posthog.capture(event, properties);
}
