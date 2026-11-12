import type { CSSProperties } from "react";
import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SiteFooter } from "../parts";

/**
 * Direction C, "Observatory". The one direction that bends the no-starfield design rule, on
 * purpose and with restraint: a deep blue-black field, one horizon, a quiet altitude grid and a
 * handful of labeled points. No unlabeled stars, no glow, no galaxy.
 *
 * The chart means something: height is how recently you touched a project. Above the horizon,
 * touched in the last 90 days. Below it, untouched for 90+ days and still paid for.
 */

/** Local token override: blue-black instead of the house near-black. Everything else is the house set. */
const SKY = {
  "--bg": "#060a12",
  "--bg-deep": "#04070d",
  "--raised": "rgb(160 185 255 / 0.03)",
  "--raised-2": "rgb(160 185 255 / 0.05)",
  "--line-1": "rgb(170 190 255 / 0.08)",
  "--line-2": "rgb(170 190 255 / 0.12)",
  "--line-3": "rgb(170 190 255 / 0.18)",
  "--fg-2": "#9aa1ae",
  "--fg-3": "#7f8796",
} as CSSProperties;

type Obj = { name: string; days: number; x: number; cost: string };
const OBJECTS: Obj[] = [
  { name: "lease-reader", days: 2, x: 63, cost: "$20/mo" },
  { name: "habit-tracker", days: 4, x: 14, cost: "$20/mo" },
  { name: "recipe-box", days: 12, x: 38, cost: "$20/mo" },
  { name: "trip-planner", days: 19, x: 80, cost: "$25/mo" },
  { name: "email-relay", days: 41, x: 50, cost: "$20/mo" },
  { name: "edge-cache", days: 61, x: 24, cost: "$5/mo" },
  { name: "invoice-bot", days: 112, x: 44, cost: "$38.40/mo" },
  { name: "pdf-to-podcast", days: 175, x: 84, cost: "$25/mo" },
  { name: "waitlist-v2", days: 201, x: 10, cost: "$25/mo" },
];

/** Height on the chart (percent from the top) for days since last push. The horizon sits at 74%. */
const HORIZON = 74;
function alt(d: number) {
  if (d <= 7) return 10 + (d / 7) * 12;
  if (d <= 30) return 22 + ((d - 7) / 23) * 22;
  if (d <= 90) return 44 + ((d - 30) / 60) * (HORIZON - 44);
  return HORIZON + 6 + Math.min((d - 90) / 120, 1) * 12;
}

const GRID: [number, string][] = [
  [22, "7 days"],
  [44, "30 days"],
];

export default function ObservatoryLanding() {
  const above = OBJECTS.filter((o) => o.days <= 90).length;
  const below = OBJECTS.filter((o) => o.days > 90);
  return (
    <div style={SKY} className="flex min-h-dvh flex-col bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-8">
        <Header motto="DevOps for vibe coders." />

        <main className="flex flex-1 flex-col pt-10 pb-24 sm:pt-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-16">
            <div>
              <h1 className="max-w-[20ch] text-[32px] leading-[1.1] font-medium tracking-[-0.025em] text-balance text-fg sm:text-[48px] sm:leading-[1.05] lg:text-[64px]">
                Every app you’ve shipped. What’s live, what broke, what you forgot.
              </h1>
              <p className="mt-4 max-w-[48ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[20px] sm:leading-[1.5]">
                The higher it sits, the more recently you touched it. Anything below the horizon you haven’t touched in 90 days, and
                you’re still paying for it.
              </p>
            </div>
            <div>
              <SignIn large />
              <Promises className="mt-6" />
            </div>
          </div>

          <figure className="mt-12">
            <div className="relative h-[400px] overflow-hidden rounded-2xl border border-line-2 bg-bg-deep sm:h-[480px]">
              {/* Instrument readout, top edge */}
              <div className="absolute inset-x-0 top-0 flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line-1 px-4 py-2.5 font-mono text-[12px] text-fg-3 sm:px-5">
                <span>9 projects · 3 GitHub accounts · 2 inboxes</span>
                <span className="hidden sm:inline">height = days since last push</span>
              </div>

              {/* Altitude grid */}
              {GRID.map(([y, label]) => (
                <div key={label} className="absolute inset-x-0 border-t border-dashed border-line-1" style={{ top: `${y}%` }}>
                  <span className="absolute -top-2.5 right-3 bg-bg-deep px-1 font-mono text-[12px] text-fg-3 sm:right-4">{label}</span>
                </div>
              ))}

              {/* Ground: below the horizon */}
              <div className="absolute inset-x-0 bottom-0 border-t border-line-3 bg-bg" style={{ top: `${HORIZON}%` }}>
                <span className="absolute -top-2.5 right-3 bg-bg-deep px-1 font-mono text-[12px] text-fg-2 sm:right-4">90 days · horizon</span>
              </div>

              {OBJECTS.map((o) => {
                const y = alt(o.days);
                const set = o.days > 90;
                const flip = o.x > 58;
                return (
                  <div
                    key={o.name}
                    className={`absolute flex items-center gap-2 ${flip ? "flex-row-reverse" : ""}`}
                    style={{ left: `${o.x}%`, top: `${y}%`, transform: `translate(${flip ? "calc(-100% + 3px)" : "-3px"}, -50%)` }}
                  >
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${set ? "bg-amber" : "bg-fg"}`} />
                    <span className={`flex items-baseline gap-2 font-mono text-[12px] whitespace-nowrap ${flip ? "flex-row-reverse" : ""}`}>
                      <span className={set ? "text-fg-2" : "text-fg"}>{o.name}</span>
                      <span className={`hidden sm:inline ${set ? "text-amber" : "text-fg-3"}`}>{o.cost}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <figcaption className="mt-4 grid gap-x-12 gap-y-6 sm:grid-cols-3">
              <Reading label="Above the horizon" value={`${above} projects`} sub="touched in the last 90 days" />
              <Reading label="Below the horizon" value={`${below.length} projects`} sub="untouched 90+ days, still paid" tone="amber" />
              <Reading label="Still paying for them" value="$88.40/mo" sub="Railway, Render, Supabase" tone="amber" />
            </figcaption>
            <p className="mt-6 text-[14px] text-fg-3">A sample sky. Yours is drawn from your own GitHub and inboxes.</p>
          </figure>

          <div className="mt-24 grid gap-12 border-t border-line-1 pt-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-mono text-[20px] leading-[1.3] tracking-[-0.01em] text-fg">“Spooky action at a distance.”</p>
              <p className="mt-1 text-[14px] text-fg-2">Albert Einstein, in a letter to Max Born, 1947</p>
            </div>
            <AgentSetup />
          </div>
        </main>

        <SiteFooter />
      </div>
      <DirectionTag letter="C" name="Observatory" note="bends the no-starfield rule" />
    </div>
  );
}

function Reading({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "amber" }) {
  return (
    <div className="border-t border-line-2 pt-3">
      <p className="flex items-center gap-2 text-[12px] text-fg-3">
        <span aria-hidden className={`size-1.5 rounded-full ${tone === "amber" ? "bg-amber" : "bg-fg"}`} />
        {label}
      </p>
      <p className="mt-1 font-mono text-[20px] leading-[1.3] text-fg">{value}</p>
      <p className="text-[14px] text-fg-2">{sub}</p>
    </div>
  );
}
