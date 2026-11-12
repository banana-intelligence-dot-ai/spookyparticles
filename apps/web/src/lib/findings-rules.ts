/**
 * The findings engine's rules, pure. Input: subscriptions from
 * src/lib/spend.ts, receipts, and the repo nodes GitHub inventory wrote. Output:
 * finding candidates with a stable key, so a recompute upserts instead of
 * duplicating and the user's verdict on each survives.
 *
 * Every rule here can be checked by the user from its evidence. Rules that need
 * provider APIs (wrong tier, orphaned keys) are not here yet; nothing is guessed.
 */
import type { FindingEvidence, FindingKind, Receipt } from "@/db/schema";
import type { Subscription } from "./spend";

export type FindingCandidate = {
  kind: FindingKind;
  key: string;
  title: string;
  action: string;
  amountCents: number | null;
  currency: string;
  confidence: number;
  evidence: FindingEvidence;
  nodeIds: string[];
};

export type RepoNode = {
  id: string;
  name: string;
  status: string | null;
  lastActivityAt: Date | null;
};

export type RulesInput = {
  subscriptions: Subscription[];
  receipts: (Receipt & { inbox: string; subject: string | null })[];
  repos: RepoNode[];
  nowMs?: number;
};

const DAY = 86_400_000;
export const ZOMBIE_IDLE_DAYS = 90;
export const EXPIRING_WINDOW_DAYS = 30;
export const PAYMENT_FAILED_WINDOW_DAYS = 30;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function computeFindings(input: RulesInput): FindingCandidate[] {
  const nowMs = input.nowMs ?? Date.now();
  const out: FindingCandidate[] = [];
  const subjectsFor = (ids: string[]) =>
    input.receipts
      .filter((r) => ids.includes(r.id))
      .map((r) => r.subject)
      .filter((s): s is string => Boolean(s))
      .slice(0, 5);

  // 1. Duplicate plans: one vendor paid from two or more inboxes, both live. Work vendors only.
  const live = input.subscriptions.filter((s) => s.monthlyCents !== null && s.verified && s.scope === "work");
  const byVendor = new Map<string, Subscription[]>();
  for (const s of live) {
    const g = byVendor.get(s.vendorKey) ?? [];
    g.push(s);
    byVendor.set(s.vendorKey, g);
  }
  for (const [, subs] of byVendor) {
    const inboxes = new Set(subs.map((s) => s.connectionId));
    if (inboxes.size < 2) continue;
    const sorted = [...subs].sort((a, b) => (b.monthlyCents ?? 0) - (a.monthlyCents ?? 0));
    const smaller = sorted[sorted.length - 1];
    const vendor = sorted[0].vendor;
    out.push({
      kind: "duplicate_plan",
      key: `duplicate_plan:${vendor.toLowerCase()}`,
      title: `${vendor} is billed to ${inboxes.size} of your inboxes`,
      action: `Check whether both ${vendor} accounts are needed; one team usually covers it.`,
      amountCents: smaller.monthlyCents,
      currency: smaller.currency ?? "USD",
      confidence: 0.8,
      evidence: {
        inbox: sorted.map((s) => s.inbox).join(", "),
        subjects: subjectsFor(sorted.flatMap((s) => s.receiptIds)),
        receiptIds: sorted.flatMap((s) => s.receiptIds).slice(0, 10),
      },
      nodeIds: [],
    });
  }

  // 2. Zombies: a live subscription whose named project matches a repo with no push in 90 days.
  for (const s of live) {
    for (const project of s.projectNames) {
      const repo = matchRepo(project, input.repos);
      if (!repo) continue;
      const idleDays = repo.lastActivityAt ? (nowMs - repo.lastActivityAt.getTime()) / DAY : null;
      const archived = repo.status === "archived";
      if (!archived && (idleDays === null || idleDays < ZOMBIE_IDLE_DAYS)) continue;
      const since = archived ? "repo archived" : `no push in ${Math.floor(idleDays as number)} days`;
      out.push({
        kind: "zombie",
        key: `zombie:${s.id}:${repo.name.toLowerCase()}`,
        title: `${s.vendor}: ${project}, ${since}`,
        action: `If ${project} is done, downgrade or delete it on ${s.vendor}${s.monthlyCents ? ` and keep ${money(s.monthlyCents, s.currency ?? "USD")} a month` : ""}.`,
        amountCents: s.monthlyCents,
        currency: s.currency ?? "USD",
        confidence: archived ? 0.85 : 0.7,
        evidence: {
          inbox: s.inbox,
          subjects: subjectsFor(s.receiptIds),
          receiptIds: s.receiptIds.slice(0, 10),
          repo: repo.name,
          lastActivityAt: repo.lastActivityAt?.toISOString() ?? null,
        },
        nodeIds: [repo.id],
      });
      break;
    }
  }

  // 3. Expiring: renewal or domain notices due within 30 days, verified senders only.
  for (const r of input.receipts) {
    if (!r.senderVerified || !r.dueAt) continue;
    if (r.kind !== "renewal_notice" && r.kind !== "domain_or_dns" && r.kind !== "trial_notice") continue;
    const days = (r.dueAt.getTime() - nowMs) / DAY;
    if (days < -1 || days > EXPIRING_WINDOW_DAYS) continue;
    const what = r.domainNames[0] ?? r.projectNames[0] ?? `${r.vendor}${r.plan ? ` ${r.plan}` : ""}`;
    const when = days < 1 ? "today" : `in ${Math.ceil(days)} days`;
    const trial = r.kind === "trial_notice";
    out.push({
      kind: "expiring",
      key: `expiring:${r.vendor.toLowerCase()}:${(r.domainNames[0] ?? r.projectNames[0] ?? r.plan ?? "").toLowerCase()}:${r.dueAt.toISOString().slice(0, 10)}`,
      title: trial ? `${what} trial converts to paid ${when}` : `${what} renews ${when}${r.amountCents ? ` for ${money(r.amountCents, r.currency ?? "USD")}` : ""}`,
      action: trial ? `Decide before it converts: keep it, or cancel the ${r.vendor} trial.` : `Decide before it renews: keep it, or cancel at ${r.vendor}.`,
      amountCents: r.amountCents,
      currency: r.currency ?? "USD",
      confidence: Math.min(0.9, r.confidence),
      evidence: { inbox: r.inbox, subjects: r.subject ? [r.subject] : [], receiptIds: [r.id] },
      nodeIds: [],
    });
  }

  // 4. Payment failed in the last 30 days with no later successful receipt from that vendor.
  const failed = input.receipts.filter(
    (r) => r.senderVerified && r.kind === "payment_failed" && r.billedAt && nowMs - r.billedAt.getTime() <= PAYMENT_FAILED_WINDOW_DAYS * DAY,
  );
  for (const f of failed) {
    const laterPaid = input.receipts.some(
      (r) =>
        r.kind === "receipt" &&
        r.vendor.toLowerCase() === f.vendor.toLowerCase() &&
        r.connectionId === f.connectionId &&
        r.billedAt &&
        f.billedAt &&
        r.billedAt.getTime() > f.billedAt.getTime(),
    );
    if (laterPaid) continue;
    const sub = live.find((s) => s.vendor.toLowerCase() === f.vendor.toLowerCase() && s.connectionId === f.connectionId);
    out.push({
      kind: "expired_card",
      key: `expired_card:${f.vendor.toLowerCase()}:${f.connectionId}`,
      title: `${f.vendor} could not charge your card${f.cardLast4 ? ` ending ${f.cardLast4}` : ""}`,
      action: `Update the card at ${f.vendor} before the account is paused.`,
      amountCents: sub?.monthlyCents ?? f.amountCents,
      currency: sub?.currency ?? f.currency ?? "USD",
      confidence: Math.min(0.9, f.confidence),
      evidence: { inbox: f.inbox, subjects: f.subject ? [f.subject] : [], receiptIds: [f.id] },
      nodeIds: [],
    });
  }

  return out.sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1));
}

/** "spooky-particles" matches "n8peace/spooky-particles"; case and separators are ignored. */
export function matchRepo(project: string, repos: RepoNode[]): RepoNode | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const p = norm(project);
  if (p.length < 3) return null;
  return repos.find((r) => norm(r.name.split("/").pop() ?? r.name) === p) ?? repos.find((r) => norm(r.name) === p) ?? null;
}

/**
 * Which repos each subscription pays for: every repo its receipts name, by project name or by
 * domain, matched with matchRepo. A line can pay for more than one repo; a line with no match
 * is absent from the map ("not linked"). Values are repo names (owner/repo), in match order.
 * Projects, Spend and the API share this so a bill is linked the same way everywhere.
 */
export function linkSubscriptions(
  subscriptions: Pick<Subscription, "id" | "projectNames" | "receiptIds">[],
  receipts: Pick<Receipt, "id" | "projectNames" | "domainNames">[],
  repos: RepoNode[],
): Map<string, string[]> {
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const out = new Map<string, string[]>();
  for (const s of subscriptions) {
    const names = [...s.projectNames];
    for (const id of s.receiptIds) {
      const r = byId.get(id);
      if (r) names.push(...r.projectNames, ...r.domainNames);
    }
    const linked: string[] = [];
    for (const n of new Set(names)) {
      const repo = matchRepo(n, repos);
      if (repo && !linked.includes(repo.name)) linked.push(repo.name);
    }
    if (linked.length) out.set(s.id, linked);
  }
  return out;
}

/** Where to act on a vendor's billing, when we know it. Keys are canonical vendor names. */
const BILLING_URLS: Record<string, string> = {
  vercel: "https://vercel.com/account/billing",
  supabase: "https://supabase.com/dashboard/org/_/billing",
  cloudflare: "https://dash.cloudflare.com/?to=/:account/billing",
  github: "https://github.com/settings/billing",
  aws: "https://console.aws.amazon.com/billing/home",
  "google cloud": "https://console.cloud.google.com/billing",
  railway: "https://railway.app/account/billing",
  render: "https://dashboard.render.com/billing",
  "fly.io": "https://fly.io/dashboard/personal/billing",
  netlify: "https://app.netlify.com/teams/_/billing",
  neon: "https://console.neon.tech/app/billing",
  openai: "https://platform.openai.com/settings/organization/billing/overview",
  anthropic: "https://platform.claude.com/settings/billing",
  namecheap: "https://ap.www.namecheap.com/domains/list/",
  godaddy: "https://account.godaddy.com/subscriptions",
  porkbun: "https://porkbun.com/account/domainsSpeedy",
  resend: "https://resend.com/settings/billing",
  twilio: "https://console.twilio.com/us1/billing/manage-billing/billing-overview",
  mailgun: "https://app.mailgun.com/settings/billing",
  clerk: "https://dashboard.clerk.com/last-active?path=billing",
  figma: "https://www.figma.com/settings",
  notion: "https://www.notion.so/my-account",
  linear: "https://linear.app/settings/billing",
  "1password": "https://my.1password.com/billing",
  cursor: "https://www.cursor.com/settings",
  replit: "https://replit.com/account#billing",
};

/** The vendor's billing page, so a finding's advice can be a link. Null when unknown. */
export function billingUrl(vendor: string | null | undefined): string | null {
  if (!vendor) return null;
  return BILLING_URLS[vendor.trim().toLowerCase()] ?? null;
}

/** The vendor a finding is about, read from its title or key. */
export function findingVendor(f: { key: string; title: string }): string | null {
  const parts = f.key.split(":");
  if (f.key.startsWith("duplicate_plan:") || f.key.startsWith("expiring:") || f.key.startsWith("expired_card:")) return parts[1] ?? null;
  if (f.key.startsWith("zombie:")) return parts[1]?.split("|")[0] ?? null;
  return null;
}
