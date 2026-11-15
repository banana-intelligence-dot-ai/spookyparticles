"use client";
/**
 * The live fix feed: a counter in the top bar and the history below the pair. Reads the public,
 * anonymized feed and refreshes every minute. Until it loads, or while it
 * is empty, the section shows the hand-checked fixes passed in, so the page never claims a number
 * it does not have.
 */
import { useEffect, useState } from "react";

type PublicFix = { at: string; what: string; minutes: number };
type Feed = { fixed: number; medianMinutes: number | null; windowDays: number; fixes: PublicFix[] };
type Fallback = { date: string; what: string; tag: string; took: string };

const REFRESH_MS = 60_000;
let shared: { feed: Feed | null; subs: Set<(f: Feed | null) => void>; timer: ReturnType<typeof setInterval> | null } = { feed: null, subs: new Set(), timer: null };

async function load() {
  try {
    const r = await fetch("/api/v1/public/fixes");
    if (!r.ok) return;
    const feed = (await r.json()) as Feed;
    shared.feed = feed;
    shared.subs.forEach((s) => s(feed));
  } catch {
    // Offline or blocked: keep what is shown.
  }
}

function useFeed(): Feed | null {
  const [feed, setFeed] = useState<Feed | null>(shared.feed);
  useEffect(() => {
    shared.subs.add(setFeed);
    if (!shared.timer) {
      void load();
      shared.timer = setInterval(() => void load(), REFRESH_MS);
    }
    return () => {
      shared.subs.delete(setFeed);
      if (!shared.subs.size && shared.timer) {
        clearInterval(shared.timer);
        shared = { ...shared, timer: null };
      }
    };
  }, []);
  return feed;
}

function took(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const live = (f: Feed | null): f is Feed => Boolean(f && f.fixed > 0);

/** Top bar: one quiet live number, only once there is one. */
export function LiveCount() {
  const feed = useFeed();
  if (!live(feed)) return null;
  return (
    <a href="#live-fixes" className="ml-auto inline-flex min-h-11 items-center gap-2 font-mono text-[12px] text-fg-2 tabular-nums hover:text-fg">
      <span aria-hidden className="live-dot" />
      {feed.fixed} fixed by agents
      <span className="sr-only"> in the last {feed.windowDays} days</span>
    </a>
  );
}

/** Below the pair: the numbers, then every fix, newest first. */
export function LiveFixes({ fallback, fallbackTitle }: { fallback: readonly Fallback[]; fallbackTitle: string }) {
  const feed = useFeed();
  const isLive = live(feed);
  return (
    <section id="live-fixes" aria-labelledby="fixes-h" className="scroll-mt-6">
      <div className="flex items-center gap-2.5">
        {isLive ? <span aria-hidden className="live-dot" /> : null}
        <h2 id="fixes-h" className="text-[20px] font-medium tracking-[-0.01em] text-fg">
          {isLive ? "Live fixes" : fallbackTitle}
        </h2>
      </div>
      {isLive ? (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <dt className="font-mono text-[12px] text-fg-3">Fixed by agents</dt>
              <dd className="mt-1 text-[34px] leading-none font-medium tracking-[-0.02em] text-fg tabular-nums">{feed.fixed}</dd>
            </div>
            <div>
              <dt className="font-mono text-[12px] text-fg-3">Median time to fix</dt>
              <dd className="mt-1 text-[34px] leading-none font-medium tracking-[-0.02em] text-accent tabular-nums">
                {feed.medianMinutes === null ? "None yet" : took(feed.medianMinutes)}
              </dd>
            </div>
          </dl>
          <ul className="mt-8 border-t border-line-1" aria-live="polite">
            {feed.fixes.map((f, i) => {
              const d = new Date(f.at);
              return (
                <li key={`${f.at}-${i}`} className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-1 border-b border-line-1 py-4 text-[15px] tabular-nums min-[821px]:grid-cols-[132px_1fr_auto]">
                  <time dateTime={f.at} className="row-span-2 font-mono min-[821px]:row-span-1 text-[13px] leading-[1.7] text-fg-3">
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    <span className="block min-[821px]:inline"><span className="hidden min-[821px]:inline"> · </span>{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                  </time>
                  <span className="text-fg">{f.what}</span>
                  <span className="col-start-2 font-mono text-[13px] leading-[1.7] text-accent min-[821px]:col-start-3">{took(f.minutes)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 font-mono text-[12px] leading-[1.6] text-fg-3">Last {feed.windowDays} days. Anonymous: only a time, the kind of break and how long the fix took. Any account can turn this off.</p>
        </>
      ) : (
        <ul className="mt-5 border-t border-line-1">
          {fallback.map((f) => (
            <li key={f.date + f.what} className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-1 border-b border-line-1 py-4 text-[15px] tabular-nums min-[821px]:grid-cols-[72px_1fr_auto]">
              <span className="font-mono text-[13px] leading-[1.7] text-fg-3">{f.date}</span>
              <span className="text-fg">
                {f.what}
                {f.tag ? <span className="ml-2 rounded-full border border-line-2 px-2 py-0.5 font-mono text-[11px] text-fg-3">{f.tag}</span> : null}
              </span>
              <span className="col-start-2 font-mono text-[13px] leading-[1.7] text-accent min-[821px]:col-start-3">{f.took}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
