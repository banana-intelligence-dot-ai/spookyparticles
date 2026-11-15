/**
 * The pair: a break and its fix, joined by a line whose length is the time between them. A fast
 * fix is a short line; a slow one is long. An open item is one particle still waiting for its
 * pair: the line is dashed and the far end is hollow. Drawn the same on Now, History and Agents,
 * so time to fix can be read down a column without reading a number.
 */
const MIN_MS = 60_000;
const MAX_MS = 7 * 86_400_000;
const MIN_PX = 10;
const MAX_PX = 72;

/** Pure: line length in px for a duration. Logarithmic, so 5 minutes and 3 days both read. */
export function pairLength(ms: number | null): number {
  if (ms === null || !Number.isFinite(ms)) return MIN_PX;
  const v = Math.min(Math.max(ms, MIN_MS), MAX_MS);
  return Math.round(MIN_PX + (Math.log(v / MIN_MS) / Math.log(MAX_MS / MIN_MS)) * (MAX_PX - MIN_PX));
}

export type PairState = "fixed" | "open" | "waiting" | "closed";

const FROM: Record<PairState, Record<"red" | "amber", string>> = {
  fixed: { red: "bg-red", amber: "bg-amber" },
  open: { red: "bg-red", amber: "bg-amber" },
  waiting: { red: "ring-1 ring-inset ring-red", amber: "ring-1 ring-inset ring-amber" },
  closed: { red: "bg-fg-3", amber: "bg-fg-3" },
};
const TO: Record<PairState, string> = {
  fixed: "bg-live",
  open: "ring-1 ring-inset ring-fg-3",
  waiting: "ring-1 ring-inset ring-fg-3",
  closed: "bg-fg-3",
};

/** Decorative: the words beside it always say the same thing. */
export function Pair({ ms, state, tone = "red", className = "" }: { ms: number | null; state: PairState; tone?: "red" | "amber"; className?: string }) {
  const solid = state === "fixed" || state === "closed";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center ${className}`}>
      <span className={`size-[7px] shrink-0 rounded-full ${FROM[state][tone]}`} />
      <span
        style={{ width: pairLength(ms) }}
        className={`mx-[3px] h-px shrink-0 ${solid ? "bg-line-3" : "pair-open bg-[repeating-linear-gradient(to_right,var(--fg-3)_0_3px,transparent_3px_6px)]"}`}
      />
      <span className={`size-[7px] shrink-0 rounded-full ${TO[state]}`} />
    </span>
  );
}
