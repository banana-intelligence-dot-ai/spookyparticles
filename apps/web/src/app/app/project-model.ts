/**
 * The /api/v1/projects and /api/v1/activity shapes, and the words the app uses for
 * them. Types and pure helpers only, so the dev preview and tests share them.
 */
import { formatCents, formatUsd } from "@/components/use-api";
import { plural } from "./data-model";

export type NoticeKind =
  | "receipt"
  | "deployment"
  | "incident_alert"
  | "deprecation_notice"
  | "account_security"
  | "payment_failed"
  | "renewal_notice"
  | "trial_notice"
  | "domain_or_dns"
  | "plan_change"
  | "other";

export type Notice = {
  id: string;
  kind: NoticeKind;
  vendor: string;
  subject: string | null;
  inbox: string;
  at: string | null;
  amountCents: number | null;
  currency: string | null;
  dueAt: string | null;
  projectNames: string[];
  domainNames: string[];
  /** False when the sender failed email authentication. Shown dimmed, never trusted. */
  verified: boolean;
  /** The plan the mail names ("Pro"), when it names one. */
  plan: string | null;
  /** The vendor's billing page, or null: where to act on the notice. */
  vendorUrl: string | null;
};

/** provider: the host the URL points at (Vercel, Netlify, …), null for custom domains. */
export type Deployment = {
  environment: string;
  /** A failure's identity, for ignoring it; and whether the owner ignored it. */
  key?: string;
  ignored?: boolean;
  state: string | null;
  url: string | null;
  at: string | null;
  provider: string | null;
  /** For a failed build the host let us read: the line that names the failure, the last log lines, the host's own page. */
  cause?: string | null;
  logTail?: string[];
  inspectorUrl?: string | null;
};

export type Health = "failed" | "attention" | "ok" | "idle" | "archived" | "unknown";

export type ProjectSubscription = {
  id: string;
  vendor: string;
  plan: string | null;
  monthlyCents: number | null;
  currency: string | null;
  inbox: string;
};

export type Project = {
  id: string;
  /** "owner/repo", or "team/project" for a host project with no known repo. */
  name: string;
  /** A GitHub repo, or a host project (Vercel) that deploys from no repo the map knows. */
  kind?: "repo" | "host";
  host?: string | null;
  url: string | null;
  productionUrl?: string | null;
  uptime?: { state: "up" | "down" | "protected" | "unknown"; since: string; lastCheckedAt: string; lastStatus: string; consecutiveDown: number; alertAt?: string | null } | null;
  private: boolean | null;
  defaultBranch: string | null;
  status: string | null;
  lastPushAt: string | null;
  health: Health;
  deployments: Deployment[];
  elsewhere?: { host: string; importUrl: string; guideUrl: string | null; guideTitle: string | null } | null;
  movedAt?: string | null;
  movedFrom?: string | null;
  monthlyCents: number | null;
  currency: string | null;
  /** A push the host never built, when the repo deploys on a connected host. */
  stalePush?: { pushedAt: string; lastDeployAt: string | null; host: string } | null;
  subscriptions: ProjectSubscription[];
  notices: Notice[];
  openFindings: { id: string; kind: string; title: string; amountCents: number | null }[];
};

export type UnlinkedSubscription = ProjectSubscription & {
  cadence: string;
  lastBilledAt: string;
  nextExpectedAt: string | null;
  receipts: number;
  verified: boolean;
};

/** GET /api/v1/projects */
export type ProjectsReport = {
  projects: Project[];
  unlinked: UnlinkedSubscription[];
  /** quietMonthlyCents: spend on idle and archived repos. */
  totals: { projects: number; failed: number; attention: number; monthlyCents: number; quietMonthlyCents: number; currency: string };
};

export type FailedDeployment = { id: string; name: string; environment: string; url: string | null; state: string | null; at: string | null; provider: string | null };

/** GET /api/v1/activity */
export type ActivityReport = { items: Notice[]; failedDeployments: FailedDeployment[] };

export const HEALTH_ORDER: Health[] = ["failed", "attention", "ok", "unknown", "idle", "archived"];

/** One signal per project: a dot and one word. Only failed is red; ok is quiet grey. Green means live, shown on the deploy, not here. */
export const HEALTH: Record<Health, { word: string; dot: string; text: string }> = {
  failed: { word: "failed", dot: "bg-red", text: "text-red" },
  attention: { word: "attention", dot: "bg-amber", text: "text-amber" },
  ok: { word: "ok", dot: "bg-fg-2", text: "text-fg-2" },
  unknown: { word: "no data", dot: "ring-1 ring-inset ring-fg-3", text: "text-fg-3" },
  idle: { word: "idle", dot: "bg-fg-3", text: "text-fg-3" },
  archived: { word: "archived", dot: "ring-1 ring-inset ring-fg-3", text: "text-fg-3" },
};

export const NOTICE_LABEL: Record<NoticeKind, string> = {
  receipt: "Charge",
  deployment: "Deploy",
  incident_alert: "Incident",
  deprecation_notice: "Deprecation",
  account_security: "Security",
  payment_failed: "Payment failed",
  renewal_notice: "Renewal",
  trial_notice: "Trial",
  domain_or_dns: "Domain",
  plan_change: "Plan change",
  other: "Notice",
};

const FAILED_STATES = new Set(["failure", "error"]);
export const isFailedState = (s: string | null) => Boolean(s && FAILED_STATES.has(s));

/** GitHub deployment states in plain words. */
const DEPLOY_STATE: Record<string, string> = {
  success: "live",
  failure: "failed",
  error: "failed",
  inactive: "inactive",
  pending: "pending",
  queued: "queued",
  in_progress: "deploying",
};
export const deployWord = (s: string | null) => (s ? (DEPLOY_STATE[s] ?? s) : "no status");

/** Production first, then the rest newest first. Failed deploys never sort out of view. */
export function orderDeployments(list: Deployment[]): Deployment[] {
  const rank = (d: Deployment) => (d.environment.toLowerCase() === "production" ? 0 : isFailedState(d.state) ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || (b.at ?? "").localeCompare(a.at ?? ""));
}

export const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const NB = " ";

/** Dense relative time: "just now", "5 min ago", "2 h ago", "3 d ago", "4 mo ago". */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}${NB}min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}${NB}h ago`;
  if (s < 86400 * 45) return `${Math.floor(s / 86400)}${NB}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}${NB}mo ago`;
  return `${Math.floor(s / (86400 * 365))}${NB}y ago`;
}

export const daysSince = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / 86_400_000);

/** "in 18 days", "tomorrow", "today", "3 days ago". */
export function dueWords(iso: string, now: number): string {
  const d = Math.round((Date.parse(iso) - now) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${plural(d, "day", "days")}` : `${plural(-d, "day", "days")} ago`;
}

/** "n…@gmail.com". Callers keep the full address in a title. */
export function shortInbox(address: string): string {
  const [local, domain] = address.split("@");
  if (!domain || local.length <= 2) return address;
  return `${local[0]}…@${domain}`;
}

/** Short inbox forms, falling back to the full address when two would read the same. */
export function inboxNamer(addresses: string[]): (a: string) => string {
  const counts = new Map<string, number>();
  for (const a of new Set(addresses)) counts.set(shortInbox(a), (counts.get(shortInbox(a)) ?? 0) + 1);
  return (a) => ((counts.get(shortInbox(a)) ?? 0) > 1 ? a : shortInbox(a));
}

const money = (cents: number, currency: string | null) =>
  !currency || currency === "USD" ? formatCents(cents) : `${(cents / 100).toFixed(2)} ${currency}`;
const roundMoney = (cents: number, currency: string | null) =>
  !currency || currency === "USD" ? formatUsd(Math.round(cents / 100) * 100) : `${Math.round(cents / 100)} ${currency}`;

/** Severity of a notice, for its dot: red is down or exposed, amber needs you, none is a fact. */
export function noticeTone(n: Notice, now: number): "red" | "amber" | null {
  if (n.kind === "deployment") return /fail|error|cancel/i.test(n.subject ?? "") ? "red" : null;
  if (n.kind === "account_security" || n.kind === "payment_failed") return "red";
  if (n.kind === "incident_alert" || n.kind === "deprecation_notice") return "amber";
  if ((n.kind === "renewal_notice" || n.kind === "trial_notice") && n.dueAt) {
    const days = (Date.parse(n.dueAt) - now) / 86_400_000;
    return days >= 0 && days <= 30 ? "amber" : null;
  }
  return null;
}

/**
 * A notice as one sentence a person reads: what happened, to what, how much.
 * "Supabase charged $25.00", "spookyparticles.ai renews in 18 days, $70".
 */
export function noticeSentence(n: Notice, now: number): { vendor: string | null; text: string; amount: string | null; detail: string | null } {
  const subject = n.subject?.trim() || NOTICE_LABEL[n.kind];
  const target = n.domainNames[0] ?? n.projectNames[0] ?? null;
  switch (n.kind) {
    case "receipt":
      return {
        vendor: null,
        text: `${n.vendor} charged`,
        amount: n.amountCents !== null ? money(n.amountCents, n.currency) : null,
        detail: n.plan,
      };
    case "renewal_notice":
      if (n.dueAt) {
        return {
          vendor: null,
          text: `${target ?? n.vendor} renews ${dueWords(n.dueAt, now)}`,
          amount: n.amountCents !== null ? roundMoney(n.amountCents, n.currency) : null,
          detail: null,
        };
      }
      break;
    case "trial_notice":
      if (n.dueAt) return { vendor: null, text: `${n.vendor} trial ends ${dueWords(n.dueAt, now)}`, amount: null, detail: n.plan };
      break;
    case "payment_failed":
      return {
        vendor: null,
        text: `${n.vendor} payment failed`,
        amount: n.amountCents !== null ? money(n.amountCents, n.currency) : null,
        detail: n.plan,
      };
  }
  return { vendor: n.vendor, text: subject, amount: null, detail: null };
}

/** Why a project has its health word, in one sentence, naming the source. */
/** The newest successful production deploy, from any source. */
export function lastProductionAt(p: Pick<Project, "deployments">): string | null {
  return p.deployments.filter((d) => d.state === "success" && d.environment.toLowerCase() === "production" && d.at).map((d) => d.at as string).sort().at(-1) ?? null;
}

/** The latest sign of life: a push or a production deploy, whichever is newer. */
export function lastActiveAt(p: Pick<Project, "deployments" | "lastPushAt">): string | null {
  const live = lastProductionAt(p);
  return [p.lastPushAt, live].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
}

export function healthReason(p: Project, now: number): string | null {
  const failed = p.deployments.find((d) => isFailedState(d.state));
  if (p.health === "archived") return "Archived on GitHub.";
  const live = lastProductionAt(p);
  if (p.status === "archived" && live) return `The repo is archived on GitHub, but production still deploys (last ${ago(live, now)}). Spooky counts it as active.`;
  if (p.health === "failed") {
    if (failed) return `The latest ${failed.environment} deploy failed${failed.at ? ` ${ago(failed.at, now)}` : ""}. Source: GitHub.`;
    const n = p.notices.find((x) => x.kind === "deployment");
    if (n) return `${n.vendor} sent a deploy notice${n.at ? ` ${ago(n.at, now)}` : ""}. Source: mail from ${n.inbox}.`;
    return "A deploy failed.";
  }
  if (p.health === "attention") {
    const bits: string[] = [];
    if (p.openFindings.length) bits.push(plural(p.openFindings.length, "open finding", "open findings"));
    const pay = p.notices.find((x) => x.kind === "payment_failed");
    if (pay) bits.push(`${pay.vendor} payment failed${pay.at ? ` ${ago(pay.at, now)}` : ""}`);
    const inc = p.notices.find((x) => x.kind === "incident_alert");
    if (inc) bits.push(`${inc.vendor} incident${inc.at ? ` ${ago(inc.at, now)}` : ""}`);
    return bits.length ? `${bits.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()) : null;
  }
  if (p.health === "idle" && p.lastPushAt) return p.kind === "host" ? `No deploy in ${plural(daysSince(p.lastPushAt, now), "day", "days")}. Source: ${p.host ?? "host"}.` : `No push in ${plural(daysSince(p.lastPushAt, now), "day", "days")}. Source: GitHub.`;
  if (p.health === "unknown") return "GitHub returned no pushes or deploys for this repo yet.";
  return null;
}

/** A date with no time (receipts often carry only a day) arrives as midnight UTC. */
const isDateOnly = (iso: string) => /T00:00:00(\.000)?Z$/.test(iso);

/** Calendar parts of a timestamp: local for real times, UTC for date-only values, so a receipt dated Nov 2 stays on Nov 2. */
function parts(iso: string): { y: number; m: number; d: number } {
  const t = new Date(iso);
  return isDateOnly(iso) ? { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() } : { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
}

/** Day key and heading for the activity feed: "Today", "Yesterday", "Thu, Oct 29". */
export function dayKey(iso: string): string {
  const p = parts(iso);
  return `${p.y}-${p.m}-${p.d}`;
}

export function dayHeading(iso: string, now: number): string {
  const key = dayKey(iso);
  const local = (ms: number) => {
    const t = new Date(ms);
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
  };
  if (key === local(now)) return "Today";
  if (key === local(now - 86_400_000)) return "Yesterday";
  const p = parts(iso);
  const d = new Date(p.y, p.m, p.d);
  const sameYear = p.y === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: sameYear ? undefined : "numeric" }).format(d);
}

export const clock = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Down on two checks in a row, the same bar the phone alert uses. One failed check is a blip and is not shown. */
export function siteConfirmedDown(p: { uptime?: { state: string; alertAt?: string | null } | null }): boolean {
  return p.uptime?.state === "down" && Boolean(p.uptime.alertAt);
}
