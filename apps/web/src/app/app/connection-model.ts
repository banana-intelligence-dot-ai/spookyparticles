/** The /api/v1/connections shape and the words the app uses for it, shared by Today, Spend and Connections. */
import { formatInt } from "@/components/use-api";
import { etaWords } from "@/lib/sync-eta";

export type Sync = {
  id: string;
  phase: "search" | "exhaustive" | "done";
  scanned: number;
  candidates: number;
  error: string | null;
  paused: boolean;
  startedAt: string;
  finishedAt: string | null;
  /** Null until the run knows its total (Gmail: once the full scan starts; GitHub: not yet). */
  totalEstimate: number | null;
  remaining: number | null;
  etaSeconds: number | null;
  percent: number | null;
  /** Billing emails being read for amounts and dates (Gmail). Null when nothing is queued. */
  reading?: { done: number; total: number } | null;
};

export type Connection = {
  id: string;
  provider: "github" | "gmail" | "vercel" | "supabase" | "cloudflare";
  display: string;
  status: "active" | "revoked" | "errored";
  statusReason: string | null;
  scopes: string[];
  createdAt: string;
  lastSyncedAt: string | null;
  sync: Sync | null;
};

export const PROVIDER: Record<Connection["provider"], string> = {
  github: "GitHub",
  gmail: "Gmail",
  vercel: "Vercel",
  supabase: "Supabase",
  cloudflare: "Cloudflare",
};

/** `?error=` codes from the connect flows. */
export const CONNECT_ERRORS: Record<string, string> = {
  consent_declined: "Consent was declined. Nothing was connected.",
  state_mismatch: "That link expired or came from another session. Try again.",
  exchange_failed: "The provider did not return a token. Try again.",
  provider_error: "The provider returned an error. Try again.",
  install_failed: "GitHub did not return an installation. Try again.",
  installation_not_yours:
    "That installation belongs to a GitHub account that is not linked here. Add that GitHub account, then install again.",
  org_needs_install_link:
    "Organization installs connect only right after an owner installs them with Install on GitHub here.",
  installation_linked_elsewhere: "That installation is already connected to another account.",
};

export const connectError = (code: string) => CONNECT_ERRORS[code] ?? "Something went wrong. Try again.";

export const isRunning = (s: Sync | null) => Boolean(s && !s.finishedAt);
export const isSynced = (c: Connection) => c.status === "active" && c.sync?.phase === "done" && Boolean(c.sync.finishedAt);

/**
 * One line of sync progress in plain words. Counts are exact; estimates say "about".
 * The state word beside it (ConnectionState) carries synced, syncing or needs attention.
 */
export function progressLine(c: Connection): string | null {
  if (c.status === "errored" && c.statusReason) return c.statusReason;
  const s = c.sync;
  if (!s) return null;
  if (s.paused) return `${formatInt(s.scanned)} repos so far. Paused at GitHub's rate limit; it picks up on its own.`;
  if (s.error) return `Stopped: ${s.error}`;
  if (c.provider === "github") return `${formatInt(s.scanned)} ${s.scanned === 1 ? "repo" : "repos"}`;
  // "billing mail" is what the search kept; it is not yet a finding.
  const kept = `${formatInt(s.candidates)} billing ${s.candidates === 1 ? "email" : "emails"}`;
  if (!isRunning(s)) return `${formatInt(s.scanned)} emails scanned, ${kept}`;
  if (s.phase === "search") return `${formatInt(s.scanned)} emails scanned, ${kept} so far. Billing mail comes first.`;
  if (s.totalEstimate) {
    const eta = etaWords(s.etaSeconds);
    return `${formatInt(s.scanned)} of about ${formatInt(s.totalEstimate)} emails scanned${eta ? `, ${eta} left` : ""}`;
  }
  return `${formatInt(s.scanned)} emails scanned, ${kept}`;
}

/** 0 to 100 for a running sync whose total is known; null otherwise (no bar without a count). */
export function runningPercent(c: Connection): number | null {
  const s = c.sync;
  if (c.status !== "active" || !s || !isRunning(s) || s.percent === null || !s.totalEstimate) return null;
  return Math.max(1, Math.min(99, s.percent));
}

/** Counted noun for a provider's connections: "1 GitHub account", "2 inboxes". */
export function countLabel(provider: Connection["provider"], n: number): string {
  if (provider === "gmail") return `${n} ${n === 1 ? "inbox" : "inboxes"}`;
  if (provider === "github") return `${n} GitHub ${n === 1 ? "account" : "accounts"}`;
  return `${n} ${PROVIDER[provider]} ${n === 1 ? "account" : "accounts"}`;
}

/** Status word for a connection's dot: done, syncing, errored, revoked, active. */
export function statusWord(c: Connection): string {
  if (c.status !== "active") return c.status;
  if (isRunning(c.sync)) return "syncing";
  if (c.sync?.paused) return "paused";
  if (c.sync?.error) return "stopped";
  return isSynced(c) ? "done" : "active";
}

/** The words a person reads beside the dot. statusWord stays the key for its color. */
const STATUS_LABEL: Record<string, string> = {
  done: "synced",
  errored: "needs attention",
  active: "connected",
};
export const statusLabel = (c: Connection) => STATUS_LABEL[statusWord(c)] ?? statusWord(c);
