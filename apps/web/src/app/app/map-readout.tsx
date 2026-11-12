/**
 * The strip under the constellation. With nothing selected it is the legend; with a
 * point selected it says what it is, what hangs off it, and where we observed it.
 */
import type { Star } from "@/components/constellation/layout";
import { CopyButton } from "@/components/copy-button";
import { buttonStyles } from "@/components/ui";
import { formatCents } from "@/components/use-api";
import { absoluteTime, relativeTime } from "./data-model";
import { kindCount, type StarDetail } from "./sky";

const KIND: Record<string, string> = {
  provider_account: "GitHub account",
  inbox: "Inbox",
  repo: "Repo",
  deployment: "Deployment",
  domain: "Domain",
  database: "Database",
  project: "Project",
  subscription: "Subscription",
  service: "Service",
  api_key: "Key",
};

const VERB: Record<string, string> = {
  repo: "pushed",
  deployment: "deployed",
  subscription: "billed",
  inbox: "synced",
  provider_account: "synced",
};

const SOURCE: Record<string, string> = { github: "GitHub", gmail: "Gmail", vercel: "Vercel", supabase: "Supabase", cloudflare: "Cloudflare" };

function Dot({ r, o, accent, ring, hollow, tone }: { r: number; o: number; accent?: boolean; ring?: boolean; hollow?: boolean; tone?: "red" | "amber" }) {
  const color = tone ? `var(--${tone})` : accent ? "var(--accent)" : "var(--fg)";
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      {ring ? (
        <>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={color} strokeWidth="1.25" />
          <circle cx="8" cy="8" r="1.4" fill={color} />
        </>
      ) : hollow ? (
        <circle cx="8" cy="8" r={r} fill="none" stroke={color} strokeWidth="1.4" opacity={o} />
      ) : (
        <circle cx="8" cy="8" r={r} fill={color} opacity={o} />
      )}
    </svg>
  );
}

/**
 * The title line above the drift chart: what distance means, in one sentence, then the
 * three colors. Distance needs no key; the axis says it.
 */
export function MapLegend({ status }: { status: string | null }) {
  return (
    <div className="border-b border-line-1 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-[16px] leading-[1.4] font-medium text-fg">Everything you run, in one field</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <Dot r={3.5} o={0.7} /> Repo or deploy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot r={4.5} o={1} hollow /> Bill, sized by cost
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot r={3.5} o={1} tone="amber" /> Needs you
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Dot r={3.5} o={1} tone="red" /> Failed deploy
          </span>
          {status ? <span className="whitespace-nowrap text-fg-3">{status}</span> : null}
        </div>
      </div>
      <p className="mt-0.5 text-[14px] text-pretty text-fg-2">Each repo, deploy and bill sits where it last moved: today on the left, years ago on the right.</p>
    </div>
  );
}

/** The strip under the chart, a fixed height so selecting never moves the page. */
export function MapHint() {
  return (
    <div className="flex min-h-16 items-center border-t border-line-1 px-4 py-3 text-[14px] text-pretty text-fg-2 sm:px-6">
      Point at anything to see what it is tied to. Click to pin it; arrow keys move between points.
    </div>
  );
}

export function MapReadout({
  star,
  detail,
  stars,
  now,
  onClear,
}: {
  star: Star;
  detail: StarDetail | undefined;
  stars: Star[];
  now: number;
  onClear: () => void;
}) {
  const kids = stars.filter((s) => (star.hub ? s.cluster === star.cluster && !s.hub : s.parent === star.id));
  const byKind = new Map<string, number>();
  for (const k of kids) byKind.set(k.kind, (byKind.get(k.kind) ?? 0) + 1);
  const facts: string[] = [];
  if (star.activityAt) facts.push(`${VERB[star.kind] ?? "changed"} ${relativeTime(star.activityAt, now)}`);
  facts.push(...(detail?.facts ?? []).filter((f) => !f.endsWith("/mo")));
  for (const [k, n] of byKind) facts.push(kindCount(k, n));
  const money = star.monthlyCents && star.monthlyCents > 0 ? star.monthlyCents : null;
  const copyable = star.kind !== "subscription";

  const [src, call] = (detail?.source ?? "").split(/:\s(.+)/);
  return (
    <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-1 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[12px] text-fg-2">{KIND[star.kind] ?? star.kind}</p>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[16px] text-fg" title={star.label}>
            {star.label}
          </span>
          {copyable ? <CopyButton value={detail?.copy ?? star.label} /> : null}
        </div>
      </div>
      {money ? (
        <p className="num font-mono text-[24px] leading-none tracking-[-0.01em] text-accent">
          {formatCents(money)}
          <span className="text-[14px] text-fg-2">/mo</span>
        </p>
      ) : null}
      <div className="min-w-0 basis-full text-[14px] text-fg-2 sm:basis-auto">
        <p title={star.activityAt ? absoluteTime(star.activityAt) : undefined}>
          {facts.map((f, i) => (
            <span key={f} className={f === "failed" ? "text-red" : f === "needs reconnect" ? "text-amber" : undefined}>
              {i ? " · " : ""}
              {f}
            </span>
          ))}
        </p>
        {src ? (
          <p className="truncate text-[12px] text-fg-2">
            Observed via {SOURCE[src] ?? src}
            {call ? <span className="font-mono">: {call}</span> : null}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {detail?.url ? (
          <a href={detail.url} target="_blank" rel="noreferrer" className={buttonStyles.secondary}>
            {star.kind === "deployment" ? "Open site" : detail.url.includes("github.com") ? "Open on GitHub" : "Open"}
          </a>
        ) : null}
        <button type="button" className={buttonStyles.ghost} onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
