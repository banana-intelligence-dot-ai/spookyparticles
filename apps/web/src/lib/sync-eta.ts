/**
 * Progress and time remaining for a sync run, from numbers the run already
 * writes: scanned so far, the run's own total estimate, and timestamps. Pure,
 * so every client (web, CLI, MCP) gets the same answer from the API.
 *
 * The rate is the run's observed average. It is capped at what the Gmail quota
 * allows, so a fast search phase cannot promise an impossible finish.
 */
import { GMAIL_UNITS_PER_MESSAGE_GET, GMAIL_UNITS_PER_SECOND } from "./rate-limiter";

/** Headers per second the per-user Gmail quota allows at most. */
export const GMAIL_MAX_MESSAGES_PER_SECOND = GMAIL_UNITS_PER_SECOND / GMAIL_UNITS_PER_MESSAGE_GET;

export type SyncEtaInput = {
  phase: "search" | "exhaustive" | "done";
  scanned: number;
  totalEstimate: number | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  /** Defaults to the real clock. */
  nowMs?: number;
  /** Upper bound on items per second. Defaults to the Gmail quota cap. */
  maxPerSecond?: number;
};

export type SyncEta = {
  /** Items still to scan, when the total is known. Never negative. */
  remaining: number | null;
  /** Seconds until done, when a rate and a total are known. */
  etaSeconds: number | null;
  /** 0 to 100, when the total is known. Capped at 99 until finished. */
  percent: number | null;
};

const NONE: SyncEta = { remaining: null, etaSeconds: null, percent: null };

export function syncEta(input: SyncEtaInput): SyncEta {
  if (input.finishedAt || input.phase === "done") {
    return { remaining: 0, etaSeconds: 0, percent: 100 };
  }
  if (input.totalEstimate === null || input.totalEstimate <= 0) return NONE;
  // Gmail's resultSizeEstimate often runs low on large inboxes. Once the run has
  // passed it, the total is unknown again: no bar, no "under a minute left" that
  // stays for half an hour. The row falls back to the plain count.
  if (input.scanned >= input.totalEstimate) return NONE;

  const total = input.totalEstimate;
  const remaining = total - input.scanned;
  const percent = Math.min(99, Math.floor((input.scanned / total) * 100));

  const now = input.nowMs ?? Date.now();
  const elapsedSeconds = (Math.max(input.updatedAt.getTime(), now) - input.startedAt.getTime()) / 1000;
  if (elapsedSeconds < 5 || input.scanned <= 0) return { remaining, etaSeconds: null, percent };

  const cap = input.maxPerSecond ?? GMAIL_MAX_MESSAGES_PER_SECOND;
  const rate = Math.min(cap, input.scanned / elapsedSeconds);
  if (rate <= 0) return { remaining, etaSeconds: null, percent };
  return { remaining, etaSeconds: Math.ceil(remaining / rate), percent };
}

/** "about 2 min", "about 1 hr 10 min", "under a minute". For UI copy. */
export function etaWords(etaSeconds: number | null): string | null {
  if (etaSeconds === null) return null;
  if (etaSeconds < 60) return "under a minute";
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `about ${hours} hr ${rest} min` : `about ${hours} hr`;
}
