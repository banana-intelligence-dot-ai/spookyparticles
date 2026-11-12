/**
 * Today: everything that is broken or needs the user, as one ranked list, plus the three
 * figures above it. Pure, so the page, the dev preview and the tests share it.
 * Red is broken, amber needs you, grey is worth a look. Every row names its source.
 */
import type { Connection } from "./connection-model";
import { plural, type Finding, type Spend } from "./data-model";
import { ago, dueWords, host, isFailedState, siteConfirmedDown, type Notice, type Project } from "./project-model";
import { money, scopeOf } from "./spend-model";

const DAY = 86_400_000;
const WINDOW = 30 * DAY;

export type TodayTone = "red" | "amber" | "grey";

export type TodayAction = { label: string; href: string; external: boolean; /** Where it goes, for the hover and screen readers. */ site?: string };

export type TodayRow = {
  id: string;
  tone: TodayTone;
  /** What, in one line. Mono part (a repo, a domain) set apart for the view. */
  what: string;
  /** Why it is here, one sentence. */
  why: string;
  /** When it started or when it is due, in words, with the instant for the hover. */
  when: string | null;
  at: number | null;
  /** Where we saw it. */
  source: string;
  action: TodayAction | null;
  /** For ranking: dollars at stake, when known. */
  cents: number;
  /** The money on the row, as shown: "$22.30/mo", "$70.00". */
  amount: string | null;
};

export type Today = {
  broken: number;
  /** Amber rows: due within 7 days, or undated (a connection to fix, a plan paid twice). */
  needsWeek: number;
  grey: number;
  rows: TodayRow[];
  /** How many rows were left out to keep the list at its cap. */
  more: number;
};

const sameVendor = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
const repoShort = (name: string) => name.split("/").pop() ?? name;
/** "Open billing on twilio.com": a verb and where it goes. */
const billing = (_url: string) => "Open billing";

/** "namecheap.com" from "https://ap.www.namecheap.com/...": the last two labels of the host. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    return url;
  }
}

/** A check-in job as the API lists it; only what Today needs. */
export type JobRow = { id: string; name: string; project: string | null; status: "new" | "never_checked_in" | "up" | "late" | "down" | "paused" | "retired"; lastPingAt: string | null; lastPingKind: string | null; lastNote: string | null; periodMinutes: number; missCount: number };

export function buildToday(
  input: {
    projects: Project[];
    findings: Finding[];
    spend: Spend | null;
    notices: Notice[];
    connections: Connection[];
    jobs?: JobRow[];
    checkOpen?: number;
    now: number;
  },
  cap = 10,
): Today {
  const { projects, findings, spend, notices, connections, now } = input;
  const jobs = input.jobs ?? [];
  const rows: TodayRow[] = [];
  if (input.checkOpen) rows.push({ id: "project-checks", tone: "amber", what: `${input.checkOpen} ${input.checkOpen === 1 ? "finding" : "findings"} open`, why: "The check found something to fix on a Vercel project.", when: null, at: now, source: "Spooky check", action: { label: "Open Check", href: "/app/check", external: false }, cents: 0, amount: null });
  const recent = (iso: string | null) => Boolean(iso && now - Date.parse(iso) <= WINDOW && Date.parse(iso) <= now + DAY);
  const open = findings.filter((f) => f.status !== "dismissed");
  const personal = (vendor: string) => Boolean(spend?.subscriptions.some((s) => sameVendor(s.vendor, vendor) && scopeOf(s, {}) === "personal"));

  // 0. Scheduled jobs that went quiet or reported a failed run: the owner's own check-ins, red.
  for (const j of jobs) {
    if (j.status !== "down") continue;
    const failed = j.lastPingKind === "fail" && j.missCount === 0;
    const heard = j.lastPingAt ? `last heard ${ago(j.lastPingAt, now)}` : "never heard from";
    rows.push({
      id: `job-${j.id}`,
      tone: "red",
      what: failed ? `${j.name}: run failed` : `${j.name}: quiet`,
      why: failed
        ? `The job reported a failed run${j.lastNote ? `: ${j.lastNote}` : "."}`
        : `Expected every ${j.periodMinutes >= 60 && j.periodMinutes % 60 === 0 ? `${j.periodMinutes / 60} h` : `${j.periodMinutes} min`}, ${heard}, ${j.missCount} missed.`,
      when: j.lastPingAt ? ago(j.lastPingAt, now) : null,
      at: j.lastPingAt ? Date.parse(j.lastPingAt) : now,
      source: "check-in",
      action: { label: "Open jobs", href: "/app/jobs", external: false },
      cents: 0,
      amount: null,
    });
  }

  // 1. Failed deploys in the last 30 days: GitHub's deploy state, or the host's mail.
  for (const p of projects) {
    if (!siteConfirmedDown(p) || !p.uptime) continue;
    rows.push({ id: `uptime-${p.id}`, tone: "red", what: `${repoShort(p.name)}: site is down`, why: `The production site answered ${p.uptime.lastStatus} on two uptime checks in a row.`, when: ago(p.uptime.since, now), at: Date.parse(p.uptime.since), source: "uptime check", action: p.productionUrl ? { label: "Open site", href: p.productionUrl, external: true } : { label: "See the project", href: "/app/projects", external: false }, cents: 0, amount: null });
  }
  for (const p of projects) {
    if (p.health === "archived") continue;
    // The host's word wins over mail: a failure is over once the same environment deployed
    // successfully after it, and a "deploy failed" email is over once any deployment succeeded after it.
    const laterSuccess = (env: string | null, since: string | null) =>
      p.deployments.some((d) => d.state === "success" && d.at && (!since || d.at > since) && (!env || d.environment === env));
    const failed = p.deployments
      .filter((d) => isFailedState(d.state) && recent(d.at) && !laterSuccess(d.environment, d.at))
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
    const mail = p.notices.find((n) => n.kind === "deployment" && n.verified && /fail|error/i.test(n.subject ?? "") && recent(n.at) && !laterSuccess(null, n.at));
    if (!failed && !mail) continue;
    const env = failed?.environment ?? "production";
    const at = failed?.at ?? mail?.at ?? null;
    const hostName = failed?.provider ?? mail?.vendor ?? null;
    rows.push({
      id: `deploy-${p.id}`,
      tone: "red",
      what: `${repoShort(p.name)}: ${env} deploy failed`,
      // The failing line from the build log when the host gave us one; otherwise what we know.
      why: failed?.cause
        ? failed.cause
        : failed
          ? `The latest ${env} deploy on ${hostName ?? "its host"} failed${failed.url ? ` (${host(failed.url)})` : ""}.`
          : `${mail!.vendor} emailed that a deploy failed.`,
      when: at ? ago(at, now) : null,
      at: at ? Date.parse(at) : null,
      source: [failed ? (failed.cause ? `${hostName ?? "host"} build log` : failed.provider === "Vercel" ? "Vercel deployments" : "GitHub deployments") : null, mail ? `${mail.vendor} mail` : null]
        .filter(Boolean)
        .join(" + "),
      action: failed?.inspectorUrl
        ? { label: "Open log", href: failed.inspectorUrl, external: true }
        : failed?.url
          ? { label: "Open deploy", href: failed.url, external: true }
          : p.url
            ? { label: "Open repo", href: p.url, external: true }
            : null,
      cents: 0,
      amount: null,
    });
  }

  // 1b. A push the host never built: amber, because the site is up but not what was pushed.
  for (const p of projects) {
    if (!p.stalePush || p.health === "archived") continue;
    const sp = p.stalePush;
    rows.push({
      id: `stale-${p.id}`,
      tone: "amber",
      what: `${repoShort(p.name)}: pushed, no deploy since`,
      why: sp.lastDeployAt
        ? `Last push ${ago(sp.pushedAt, now)}; ${sp.host} has not deployed since ${ago(sp.lastDeployAt, now)}. The live site is older than the repo.`
        : `Last push ${ago(sp.pushedAt, now)}; ${sp.host} shows no deployment of this repo yet.`,
      when: ago(sp.pushedAt, now),
      at: Date.parse(sp.pushedAt),
      source: `GitHub + ${sp.host}`,
      action: p.url ? { label: "Open repo", href: p.url, external: true } : null,
      cents: 0,
      amount: null,
    });
  }

  // 2. Payments that failed: the finding when there is one, else the notice.
  const cards = open.filter((x) => x.kind === "expired_card");
  const paid = new Set<string>();
  for (const f of cards) {
    // When it happened is the email's date, never when we worked it out.
    const mail = notices.find((n) => n.kind === "payment_failed" && n.at && f.title.toLowerCase().includes(n.vendor.toLowerCase()));
    rows.push({
      id: `pay-${f.id}`,
      tone: "red",
      what: f.title,
      why: f.action,
      when: mail?.at ? ago(mail.at, now) : null,
      at: mail?.at ? Date.parse(mail.at) : null,
      source: `${mail?.vendor ?? f.title.split(" ")[0]} mail${f.evidence.inbox ? ` · ${f.evidence.inbox}` : ""}`,
      action: f.actionUrl ? { label: "Update card", href: f.actionUrl, external: true } : { label: "See it on Spend", href: "/app/findings#go-title", external: false },
      cents: f.amountCents ?? 0,
      amount: f.amountCents !== null ? `${money(f.amountCents, f.currency)}/mo` : null,
    });
  }
  for (const n of notices) {
    if (n.kind !== "payment_failed" || !n.verified || !recent(n.at) || paid.has(n.vendor.toLowerCase())) continue;
    if (cards.some((f) => f.title.toLowerCase().includes(n.vendor.toLowerCase()))) continue;
    paid.add(n.vendor.toLowerCase());
    rows.push({
      id: `pay-${n.id}`,
      tone: "red",
      what: `${n.vendor} couldn't charge your card`,
      why: `${n.subject ?? "Payment failed"}${n.amountCents !== null ? `, ${money(n.amountCents, n.currency)}` : ""}.`,
      when: n.at ? ago(n.at, now) : null,
      at: n.at ? Date.parse(n.at) : null,
      source: `${n.vendor} mail · ${n.inbox}`,
      action: n.vendorUrl ? { label: "Update card", href: n.vendorUrl, external: true } : null,
      cents: n.amountCents ?? 0,
      amount: n.amountCents !== null ? money(n.amountCents, n.currency) : null,
    });
  }

  // 3. Connections that stopped: an expired inbox, a suspended install.
  for (const c of connections) {
    if (c.status !== "errored") continue;
    rows.push({
      id: `conn-${c.id}`,
      tone: "amber",
      what: `${c.display} stopped syncing`,
      why: c.statusReason ?? "The connection needs to be renewed.",
      when: c.lastSyncedAt ? `last synced ${ago(c.lastSyncedAt, now)}` : null,
      at: null,
      source: c.provider === "gmail" ? "Gmail connection" : c.provider === "github" ? "GitHub app install" : `${c.provider} connection`,
      action: { label: c.provider === "gmail" ? "Reconnect" : "Fix the install", href: "/app/connections", external: false },
      cents: 0,
      amount: null,
    });
  }

  // 4. Renewals and trials due in the next 30 days.
  const seen = new Set<string>();
  for (const n of notices) {
    if ((n.kind !== "renewal_notice" && n.kind !== "trial_notice") || !n.verified || !n.dueAt) continue;
    const due = Date.parse(n.dueAt);
    if (due < now - DAY / 2 || due > now + WINDOW || personal(n.vendor)) continue;
    const label = n.domainNames[0] ?? n.vendor;
    const key = `${label}|${n.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const trial = n.kind === "trial_notice";
    rows.push({
      id: `due-${n.id}`,
      // Amber only when the decision is due this week; later ones are worth a look.
      tone: due <= now + 7 * DAY ? "amber" : "grey",
      what: trial ? `${n.vendor} trial ends ${dueWords(n.dueAt, now)}` : `${label} renews ${dueWords(n.dueAt, now)}`,
      why: trial ? "It starts charging unless you cancel." : "Keep it, or turn off auto-renew before then.",
      when: dueWords(n.dueAt, now),
      at: due,
      source: `${n.vendor} mail · ${n.inbox}`,
      action: n.vendorUrl
        ? { label: billing(n.vendorUrl), href: n.vendorUrl, external: true }
        : { label: "See it on Spend", href: "/app/findings#due-title", external: false },
      cents: n.amountCents ?? 0,
      amount: n.amountCents !== null ? `${money(n.amountCents, n.currency)} once` : null,
    });
  }

  // 5. Duplicate plans: money paid twice.
  for (const f of open.filter((x) => x.kind === "duplicate_plan")) {
    rows.push({
      id: `dup-${f.id}`,
      tone: "amber",
      what: f.title,
      why: f.action,
      when: null,
      at: null,
      source: `${plural(f.evidence.receiptIds.length, "receipt", "receipts")}${f.evidence.inbox ? ` in ${f.evidence.inbox}` : ""}`,
      action: f.actionUrl ? { label: billing(f.actionUrl), href: f.actionUrl, external: true } : { label: "See it on Spend", href: "/app/findings#go-title", external: false },
      cents: f.amountCents ?? 0,
      amount: f.amountCents !== null ? `${money(f.amountCents, f.currency)}/mo` : null,
    });
  }

  // 6. Idle projects still being paid for: the finding when there is one, else the project.
  const covered = new Set<string>();
  for (const f of open.filter((x) => x.kind === "zombie" && x.amountCents !== null)) {
    if (f.evidence.repo) covered.add(f.evidence.repo);
    rows.push({
      id: `idle-${f.id}`,
      tone: "grey",
      what: f.title,
      why: f.action,
      // The title already says how long it has been quiet.
      when: null,
      at: null,
      source: [f.evidence.receiptIds.length ? `${plural(f.evidence.receiptIds.length, "receipt", "receipts")}` : null, f.evidence.repo ? "GitHub" : null].filter(Boolean).join(" + "),
      action: f.actionUrl ? { label: billing(f.actionUrl), href: f.actionUrl, external: true } : { label: "See it on Spend", href: "/app/findings#go-title", external: false },
      cents: f.amountCents ?? 0,
      amount: f.amountCents !== null ? `${money(f.amountCents, f.currency)}/mo` : null,
    });
  }
  for (const p of projects) {
    if ((p.health !== "idle" && p.health !== "archived") || !p.monthlyCents || covered.has(p.name)) continue;
    rows.push({
      id: `idle-${p.id}`,
      tone: "grey",
      what: `${repoShort(p.name)} is ${p.health} and still billed`,
      why: `Billed by ${[...new Set(p.subscriptions.map((s) => s.vendor))].join(", ")}.`,
      when: p.lastPushAt ? `last push ${ago(p.lastPushAt, now)}` : null,
      at: null,
      source: "receipts + GitHub",
      action: { label: "See the project", href: "/app/projects", external: false },
      cents: p.monthlyCents,
      amount: `${money(p.monthlyCents, p.currency)}/mo`,
    });
  }

  for (const r of rows) if (r.action?.external) r.action.site = siteOf(r.action.href);

  const rank: Record<TodayTone, number> = { red: 0, amber: 1, grey: 2 };
  rows.sort(
    (a, b) =>
      rank[a.tone] - rank[b.tone] ||
      // Red: newest first. Amber: soonest due first, undated after. Grey: most money first.
      (a.tone === "red" ? (b.at ?? 0) - (a.at ?? 0) : 0) ||
      (a.tone === "amber" ? (a.at ?? Infinity) - (b.at ?? Infinity) : 0) ||
      b.cents - a.cents,
  );

  const week = now + 7 * DAY;
  void week;
  return {
    broken: rows.filter((r) => r.tone === "red").length,
    needsWeek: rows.filter((r) => r.tone === "amber").length,
    grey: rows.filter((r) => r.tone === "grey").length,
    rows: rows.slice(0, cap),
    more: Math.max(0, rows.length - cap),
  };
}
