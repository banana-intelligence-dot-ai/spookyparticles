/**
 * The daily overnight line for @spookyparticles (Nate, Nov 22: ship automatically, no review).
 * It counts what Spooky caught on our own apps from 8pm to 8am Pacific, plus the last 30 days.
 * Pure parts only: the watcher (run.ts) reads the catches and passes them in.
 * When a number cannot be computed the line is null and that day falls back to the queue; never a guess.
 */
import type { Catch } from "@/lib/catches";
import { medianFixMinutes } from "@/lib/fix-stats";
import { PRIVATE_PROJECT_TERMS } from "./private-terms";

const ZONE = "America/Los_Angeles";

/** UTC ms for a wall-clock time in Pacific on the given Pacific calendar day. */
function pacificWall(y: number, m: number, d: number, hour: number): number {
  const offset = (t: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
        .formatToParts(new Date(t)).map((p) => [p.type, p.value]),
    );
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - t;
  };
  const guess = Date.UTC(y, m - 1, d, hour);
  // Twice, so a clock change between midnight and the hour (the 2am switch) uses the offset in force at the hour.
  return guess - offset(guess - offset(guess));
}

/** The night that ends at 8am Pacific on today's Pacific date: [8pm the day before, 8am today). */
export function nightWindow(nowMs: number): { start: number; end: number; label: string } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs)).split("-").map(Number);
  const end = pacificWall(y, m, d, 8);
  const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  const start = pacificWall(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 20);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d))).replace(",", "");
  return { start, end, label };
}

export type OvernightStats = { night: number; nightGreen: number; caught: number; green: number; medianMinutes: number | null; label: string };

/**
 * Counts from the catches list. A catch is one episode, so repeats inside it count once. Retired and
 * ignored catches are left out, and so are private projects. Null when the list may be cut short.
 */
export function overnightStats(catches: Catch[], capped: boolean, nowMs: number): OvernightStats | null {
  if (capped) return null;
  const { start, end, label } = nightWindow(nowMs);
  if (nowMs < end) return null;
  // The catches list keeps anything fixed in the last 30 days; the post counts only what was caught in them.
  const monthStart = nowMs - 30 * 86_400_000;
  const counted = catches.filter((c) => Date.parse(c.caughtAt) >= monthStart && c.status !== "retired" && c.status !== "ignored" && !PRIVATE_PROJECT_TERMS.some((p) => (c.project ?? "").toLowerCase().includes(p)));
  const greenBy = (c: Catch, t: number) => c.status === "fixed" && c.fixedAt !== null && Date.parse(c.fixedAt) < t;
  const night = counted.filter((c) => { const t = Date.parse(c.caughtAt); return t >= start && t < end; });
  const fixed = counted.filter((c) => c.status === "fixed");
  const median = medianFixMinutes(fixed);
  return {
    night: night.length,
    nightGreen: night.filter((c) => greenBy(c, end)).length,
    caught: counted.length,
    green: fixed.length,
    medianMinutes: median === null ? null : Math.round(median),
    label,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line, no link, no names. The date keeps each day's line distinct. */
export function overnightText(s: OvernightStats): string {
  const night = s.night === 0
    ? "Overnight on our own apps, Spooky Particles caught 0 problems."
    : `Overnight on our own apps, Spooky Particles caught ${plural(s.night, "problem", "problems")}, and ${s.nightGreen === s.night ? (s.night === 1 ? "it is" : "all are") : s.nightGreen === 0 ? "none are" : `${s.nightGreen} ${s.nightGreen === 1 ? "is" : "are"}`} back to green by 8am.`;
  const month = `Last 30 days: ${s.caught} caught, ${s.green} back to green${s.medianMinutes === null ? "" : `, median ${plural(s.medianMinutes, "minute", "minutes")} to green`}.`;
  return `${night} ${month} ${s.label}.`;
}
