/** Pure fix facts, safe to import from client code (no database imports). */
import type { Catch } from "./catches";

/** A fix counts as an agent's when an agent asked about the break, opened the PR, or confirmed it on production. */
export function fixedByAgent(c: Pick<Catch, "heardAt" | "confirmedAt" | "fixedBy">): boolean {
  return Boolean(c.heardAt || c.confirmedAt || c.fixedBy?.kind === "pr");
}

/**
 * The stricter rule for anything shown in public: a code change landed (a commit or PR) and an agent
 * was on it (it heard about the break first, or opened the PR). A job that came back on its own
 * after an agent merely looked does not count.
 */
export function provenAgentFix(c: Pick<Catch, "heardAt" | "fixedBy">): boolean {
  if (!c.fixedBy) return false;
  return c.fixedBy.kind === "pr" || Boolean(c.heardAt);
}

/** Median minutes from caught to fixed, over fixes that have both times. Null when there are none. */
export function medianFixMinutes(fixed: Pick<Catch, "caughtAt" | "fixedAt">[]): number | null {
  const d = fixed
    .filter((c) => c.fixedAt)
    .map((c) => (Date.parse(c.fixedAt as string) - Date.parse(c.caughtAt)) / 60_000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  if (!d.length) return null;
  const mid = d.length >> 1;
  return d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
}
