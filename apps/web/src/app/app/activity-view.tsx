"use client";
/**
 * Activity: one feed of what every service told you, newest first, grouped by day.
 * Notices and charges read from mail, plus deploys GitHub reports as failed. A failure
 * GitHub and the host's mail both report is one line with both sources. Every line names
 * its source; unverified senders are marked and dimmed.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Chips, Empty, ErrorLine, Meter, buttonStyles, surface } from "@/components/ui";
import { formatInt, formatUsd, useApi } from "@/components/use-api";
import { countLabel, isRunning, type Connection } from "./connection-model";
import { HistoryStrip, STRIP_DAYS, type Signal } from "./history-strip";
import { absoluteTime, plural } from "./data-model";
import {
  NOTICE_LABEL,
  ago,
  clock,
  dayHeading,
  dayKey,

  inboxNamer,
  noticeSentence,
  noticeTone,
  type ActivityReport,
  type FailedDeployment,
  type Notice,
  type NoticeKind,
} from "./project-model";

const MAX = 500;
const DAY = 86_400_000;

export function ActivityView() {
  const [limit, setLimit] = useState(100);
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync) || c.sync?.reading) ? 5000 : null),
  });
  const activity = useApi<ActivityReport>(`/api/v1/activity?limit=${limit}`);
  const { reload } = activity;
  useEffect(() => {
    if (conns.data) void reload();
  }, [conns.data, reload]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [activity.data]);

  return (
    <ActivityScreen
      ready={Boolean(conns.data) && Boolean(activity.data) && now !== null}
      connections={conns.data?.connections ?? []}
      report={activity.data}
      error={conns.error ?? activity.error}
      now={now ?? 0}
      limit={limit}
      onMore={limit < MAX ? () => setLimit((l) => Math.min(MAX, l + 100)) : null}
    />
  );
}

/** One line in the feed: a notice from mail, or a failed deploy from GitHub (with the mail that reported it too). */
export type Item =
  | { type: "notice"; id: string; at: string | null; kind: NoticeKind; n: Notice }
  | { type: "deploy"; id: string; at: string | null; kind: "deployment"; d: FailedDeployment; mail: Notice | null };

/** Filter groups: what broke, what is at risk, what it costs. */
type Group = "deploys" | "incidents" | "security" | "billing" | "domains" | "other";
type Filter = "all" | Group;
const GROUP_OF: Record<NoticeKind, Group> = {
  deployment: "deploys",
  incident_alert: "incidents",
  deprecation_notice: "incidents",
  account_security: "security",
  payment_failed: "billing",
  renewal_notice: "billing",
  trial_notice: "billing",
  plan_change: "billing",
  receipt: "billing",
  domain_or_dns: "domains",
  other: "other",
};
const GROUP_LABEL: Record<Group, string> = {
  deploys: "Deploys",
  incidents: "Incidents",
  security: "Security",
  billing: "Billing",
  domains: "Domains",
  other: "Other",
};
/** One of each, for the strip's day sentence ("2 incidents, 1 billing notice"). */
const SIGNAL_WORD: Record<Group, string> = { deploys: "deploy notice", incidents: "incident", security: "security alert", billing: "billing notice", domains: "domain notice", other: "notice" };
const GROUPS: Group[] = ["deploys", "incidents", "security", "billing", "domains", "other"];

/** Last path segment, lowercased: "octocat/ledger-api" and "ledger-api" are the same repo. */
const repoKey = (name: string) => (name.split("/").pop() ?? name).toLowerCase();
const isFailNotice = (n: Notice, now: number) => n.kind === "deployment" && noticeTone(n, now) === "red";

/** Activity, presentational: the dev preview renders it against fixtures. */
export function ActivityScreen({
  ready,
  connections,
  report,
  error,
  now,
  limit,
  onMore,
}: {
  ready: boolean;
  connections: Connection[];
  report: ActivityReport | null;
  error: string | null;
  now: number;
  limit: number;
  onMore: (() => void) | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState<string | null>(null);

  const items = useMemo<Item[]>(() => {
    if (!report) return [];
    const used = new Set<string>();
    const deploys: Item[] = report.failedDeployments.map((d) => {
      const repo = repoKey(d.name.replace(/ \([^)]*\)$/, ""));
      // The host's failure email for the same repo within a day and a half is the same event.
      const mail =
        report.items.find(
          (n) =>
            !used.has(n.id) &&
            isFailNotice(n, now) &&
            n.projectNames.some((p) => repoKey(p) === repo) &&
            n.at &&
            d.at &&
            Math.abs(Date.parse(n.at) - Date.parse(d.at)) < 1.5 * DAY,
        ) ?? null;
      if (mail) used.add(mail.id);
      return { type: "deploy", id: `gh-${d.id}`, at: d.at, kind: "deployment", d, mail };
    });
    const notices: Item[] = report.items.filter((n) => !used.has(n.id)).map((n) => ({ type: "notice", id: n.id, at: n.at, kind: n.kind, n }));
    return [...deploys, ...notices].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [report, now]);

  const counts = useMemo(() => {
    const c = new Map<Group, number>();
    for (const i of items) c.set(GROUP_OF[i.kind], (c.get(GROUP_OF[i.kind]) ?? 0) + 1);
    return c;
  }, [items]);

  const inboxName = useMemo(
    () => inboxNamer([...connections.filter((c) => c.provider === "gmail").map((c) => c.display), ...(report?.items.map((n) => n.inbox) ?? [])]),
    [connections, report],
  );

  const signals = useMemo<Signal[]>(
    () =>
      items
        .filter((i) => i.at)
        .map((i) => ({
          at: i.at as string,
          tone: i.type === "deploy" ? "red" : noticeTone(i.n, now),
          label: i.type === "deploy" ? "failed deploy" : SIGNAL_WORD[GROUP_OF[i.kind]],
          cents: i.type === "notice" && i.kind === "receipt" && i.n.verified && i.n.currency?.toUpperCase() === "USD" ? i.n.amountCents : null,
        })),
    [items, now],
  );
  const oldest = report?.items.at(-1)?.at ?? null;
  const partialSince = report && onMore && report.items.length >= limit && oldest && now - Date.parse(oldest) < STRIP_DAYS * DAY ? oldest : null;

  const byKind = filter === "all" ? items : items.filter((i) => GROUP_OF[i.kind] === filter);
  const shown = day ? byKind.filter((i) => i.at && dayKey(i.at) === day) : byKind;
  const days = useMemo(() => {
    // What is still broken sits above Today, whenever it started.
    const failing = shown.filter((i) => i.type === "deploy");
    const out: { key: string; heading: string; items: Item[] }[] = failing.length ? [{ key: "failing", heading: "Still failing", items: failing }] : [];
    for (const i of shown) {
      if (i.type === "deploy") continue;
      const key = i.at ? dayKey(i.at) : "undated";
      let g = out.at(-1);
      if (!g || g.key !== key || g.key === "failing") {
        g = { key, heading: i.at ? dayHeading(i.at, now) : "Undated", items: [] };
        out.push(g);
      }
      g.items.push(i);
    }
    return out;
  }, [shown, now]);

  const inboxes = connections.filter((c) => c.provider === "gmail" && c.status !== "revoked");
  const github = connections.filter((c) => c.provider === "github" && c.status !== "revoked").length;
  const reading = inboxes.reduce(
    (a, c) => (c.sync?.reading ? { done: a.done + c.sync.reading.done, total: a.total + c.sync.reading.total } : a),
    { done: 0, total: 0 },
  );
  const stillReading = reading.total > 0 && reading.done < reading.total;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg">History</h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[1.5] text-pretty text-fg-2">What your services told you, newest first: failed deploys, incidents, charges and renewals. Nothing to set up.</p>
        {ready && items.length ? (
          <>
            <WeekLine items={items} now={now} readAt={mailReadAt(inboxes)} signedOut={inboxes.some((c) => c.status === "errored")} />
            <p className="mt-2 text-[14px] text-pretty text-fg-2">
              From {inboxes.length ? `mail in ${countLabel("gmail", inboxes.length)}` : "no inboxes yet"}
              {github ? ` and deploys on ${countLabel("github", github)}` : ""}.
            </p>
          </>
        ) : !ready && !error ? (
          <p className="mt-3 text-[16px] text-fg-2">Loading history.</p>
        ) : null}
      </header>

      {error ? <ErrorLine message={error} /> : null}

      {ready && stillReading && items.length ? (
        <div className="mb-8 max-w-md">
          <p className="mb-2 text-[14px] text-fg-2">
            Still reading <span className="num text-fg">{formatInt(reading.done)}</span> of{" "}
            <span className="num text-fg">{formatInt(reading.total)}</span> emails. New lines land here as they are read.
          </p>
          <Meter percent={Math.round((reading.done / reading.total) * 100)} label="Emails read" />
        </div>
      ) : null}

      {ready && !items.length ? (
        stillReading ? (
          <Empty title="Reading your mail">
            <p>
              <span className="num text-fg">{formatInt(reading.done)}</span> of <span className="num text-fg">{formatInt(reading.total)}</span>{" "}
              emails read so far. Failed deploys, incidents, renewals and charges show up here as each one is read.
            </p>
            <div className="mt-4 max-w-sm">
              <Meter percent={Math.round((reading.done / reading.total) * 100)} label="Emails read" />
            </div>
          </Empty>
        ) : !inboxes.length ? (
          <Empty
            title="Nothing to show yet"
            action={
              <Link href="/app" className={buttonStyles.primary}>
                Connect Gmail
              </Link>
            }
          >
            Activity comes from the mail your services send: failed deploys, incidents, renewals, charges. Connect an inbox and they
            line up here.
          </Empty>
        ) : (
          <Empty title="Nothing observed yet">
            No deploy notices, renewals or charges in {plural(inboxes.length, "inbox", "inboxes")} so far, and GitHub reports no
            failed deploys.
          </Empty>
        )
      ) : null}

      {ready && items.length ? <HistoryStrip signals={signals} now={now} partialSince={partialSince} picked={day} onPick={setDay} /> : null}

      {items.length ? (
        <section aria-label="History" className="mb-16">
          <div className="mb-4">
            <Chips<Filter>
              label="Filter by kind"
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "All", count: items.length },
                ...GROUPS.filter((g) => counts.get(g)).map((g) => ({ key: g, label: GROUP_LABEL[g], count: counts.get(g) })),
              ]}
            />
          </div>

          <div className={`overflow-hidden ${surface}`}>
            {days.map((g, gi) => (
              <section key={g.key} aria-label={g.heading}>
                <h2 className={`bg-bg-deep/40 px-4 py-1.5 text-[12px] font-medium sm:px-5 text-fg-2 ${gi ? "border-t border-line-1" : ""}`}>
                  {g.heading}
                </h2>
                <ul className="border-t border-line-1">
                  {g.items.map((i) =>
                    i.type === "deploy" ? (
                      <DeployLine key={i.id} d={i.d} mail={i.mail} now={now} />
                    ) : (
                      <NoticeLine key={i.id} n={i.n} now={now} inboxName={inboxName} />
                    ),
                  )}
                </ul>
              </section>
            ))}
          </div>

          {onMore && report && report.items.length >= limit ? (
            <button type="button" onClick={onMore} className={`mt-6 ${buttonStyles.secondary}`}>
              Show older
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

const STALE_MAIL_MS = 2 * DAY;

/** When mail was last read: the newest finished read across live inboxes, or null. */
export function mailReadAt(connections: Connection[]): string | null {
  const done = connections
    .filter((c) => c.provider === "gmail" && c.status !== "revoked" && c.sync?.finishedAt)
    .map((c) => c.sync?.finishedAt as string);
  return done.sort().at(-1) ?? null;
}

type Part = { text: string; red?: boolean };

/**
 * Pure: the History headline. What is still failing comes first, whatever its age. Then this
 * week's clauses, only the true ones. It never calls a week quiet when mail has not been read
 * in it: then it says when mail was last read.
 */
export function weekSummary(items: Item[], now: number, readAt: string | null): { failing: Part | null; week: Part[]; staleSince: string | null } {
  const name = (i: Item) => (i.type === "deploy" ? repoKey(i.d.name.replace(/ \([^)]*\)$/, "")) : repoKey(i.n.projectNames[0] ?? i.id));
  const failingRepos = new Set(items.filter((i) => i.type === "deploy").map(name));
  const week = items.filter((i) => i.at && now - Date.parse(i.at) <= 7 * DAY);
  const notices = week.filter((i): i is Extract<Item, { type: "notice" }> => i.type === "notice");
  const failed = new Set(notices.filter((i) => isFailNotice(i.n, now)).map(name).filter((r) => !failingRepos.has(r))).size;
  const payments = notices.filter((i) => i.kind === "payment_failed" && i.n.verified).length;
  const security = notices.filter((i) => i.kind === "account_security" && i.n.verified).length;
  const incidents = notices.filter((i) => i.kind === "incident_alert" && i.n.verified).length;
  const charges = notices.filter((i) => i.kind === "receipt" && i.n.verified);
  const chargeCents = charges.reduce((a, i) => a + (i.n.currency === null || i.n.currency === "USD" ? (i.n.amountCents ?? 0) : 0), 0);
  const dueOf = (kind: NoticeKind) => items.filter((i) => i.type === "notice" && i.kind === kind && noticeTone(i.n, now) === "amber").length;
  const renewals = dueOf("renewal_notice");
  const trials = dueOf("trial_notice");

  const parts: Part[] = [];
  if (failed) parts.push({ text: plural(failed, "failed deploy", "failed deploys"), red: true });
  if (payments) parts.push({ text: plural(payments, "failed payment", "failed payments"), red: true });
  if (security) parts.push({ text: plural(security, "security alert", "security alerts"), red: true });
  if (incidents) parts.push({ text: plural(incidents, "incident", "incidents") });
  if (charges.length) parts.push({ text: `${plural(charges.length, "charge", "charges")}${chargeCents ? ` for ${formatUsd(chargeCents)}` : ""}` });
  if (renewals) parts.push({ text: `${plural(renewals, "renewal", "renewals")} due` });
  if (trials) parts.push({ text: plural(trials, "trial ending", "trials ending") });

  return {
    failing: failingRepos.size ? { text: `${plural(failingRepos.size, "deploy", "deploys")} still failing`, red: true } : null,
    week: parts,
    staleSince: readAt && now - Date.parse(readAt) > STALE_MAIL_MS ? readAt : null,
  };
}

const shortDate = (at: string) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function WeekLine({ items, now, readAt, signedOut }: { items: Item[]; now: number; readAt: string | null; signedOut: boolean }) {
  const { failing, week, staleSince } = weekSummary(items, now, readAt);
  const stale = staleSince ? (
    <span className="text-fg-2">
      {" "}
      Mail was last read {shortDate(staleSince)}, so {week.length ? "anything newer" : "this week"} isn&apos;t in yet.{" "}
      {signedOut ? "Google signed Spooky out of your inbox. " : null}
      <Link href="/app/connections" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
        {signedOut ? "Reconnect Gmail" : "Read new mail"}
      </Link>
    </span>
  ) : null;
  return (
    <p className="mt-3 text-[20px] leading-[1.35] tracking-[-0.01em] text-balance text-fg sm:text-[24px]">
      {failing ? (
        <>
          <span className="text-red">{failing.text}</span>.{" "}
        </>
      ) : null}
      {week.length ? (
        <>
          This week:{" "}
          {week.map((p, i) => (
            <span key={p.text}>
              {i ? (i === week.length - 1 ? " and " : ", ") : ""}
              <span className={p.red ? "text-red" : undefined}>{p.text}</span>
            </span>
          ))}
          .
        </>
      ) : staleSince ? null : failing ? (
        "Nothing else this week."
      ) : (
        "A quiet week. Nothing failed, nothing billed."
      )}
      {stale}
    </p>
  );
}

function Dot({ tone }: { tone: "red" | "amber" | null }) {
  return <span aria-hidden className={`mt-[8px] size-1.5 shrink-0 rounded-full ${tone === "red" ? "bg-red" : tone === "amber" ? "bg-amber" : ""}`} />;
}

/** Desktop: time, dot, the event, then kind and source on the right, one line. Phone: two lines. */
const LINE =
  "grid grid-cols-[6px_minmax(0,1fr)] gap-x-3 border-b border-line-1 px-4 py-2.5 last:border-b-0 sm:grid-cols-[64px_6px_minmax(0,1fr)] sm:gap-x-4 sm:px-5 lg:grid-cols-[64px_6px_minmax(0,1fr)_minmax(0,auto)] lg:items-baseline";

/** Clock time only when the source gave one: date-only receipts would read as a fake midnight. */
function Time({ at }: { at: string | null }) {
  const timed = at && !/T00:00:00(\.000)?Z$/.test(at);
  return (
    <span className="num hidden text-right text-[12px] whitespace-nowrap text-fg-3 sm:block sm:pt-[2px]" title={at ? absoluteTime(at) : undefined}>
      {timed ? clock(at) : ""}
    </span>
  );
}

function OutLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg">
      {label}
      <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 3.5h6.5V10M12.5 3.5 4 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

const BILLING_KINDS = new Set<NoticeKind>(["receipt", "payment_failed", "renewal_notice", "trial_notice", "plan_change"]);

function NoticeLine({ n, now, inboxName }: { n: Notice; now: number; inboxName: (a: string) => string }) {
  const s = noticeSentence(n, now);
  const tone = n.verified ? noticeTone(n, now) : null;
  const target = n.projectNames[0] ?? n.domainNames[0] ?? null;
  // One pattern on every line: the vendor in 500, then the event.
  const vendor = s.vendor ?? n.vendor;
  const rest = s.vendor ? s.text : s.text.startsWith(`${n.vendor} `) ? s.text.slice(n.vendor.length + 1) : `${s.text}`;
  const joiner = s.vendor || !s.text.startsWith(`${n.vendor} `) ? ": " : " ";
  // The way out: the vendor's own page. Never offered for a sender that failed authentication.
  const out = n.verified ? n.vendorUrl : null;
  const ago_ = n.at ? ago(n.at, now) : null;
  return (
    <li className={`${LINE} ${n.verified ? "" : "opacity-60"}`}>
      <Time at={n.at} />
      <Dot tone={tone} />
      <p className="min-w-0 text-[14px] leading-[1.45] text-pretty text-fg lg:truncate" title={n.subject ?? undefined}>
        <span className="font-medium">{vendor}</span>
        {joiner}
        {rest}
        {s.amount ? (
          <>
            {", "}
            <span className="num">{s.amount}</span>
          </>
        ) : null}
        {s.detail ? <span className="text-fg-2">, {s.detail}</span> : null}
      </p>
      <p className="col-start-2 mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[12px] text-fg-3 sm:col-start-3 lg:col-start-4 lg:mt-0 lg:justify-end">
        <span title={`Source: mail to ${n.inbox}`}>
          {NOTICE_LABEL[n.kind]}
        </span>
        {target ? <span className="max-w-40 truncate font-mono">· {target}</span> : null}
        <span className="hidden sm:inline" title={`Source: mail to ${n.inbox}`}>
          · from {inboxName(n.inbox)}
        </span>

        {ago_ ? <span className="sm:hidden">· {ago_}</span> : null}
        {!n.verified ? <span className="text-amber">· sender not verified</span> : null}
        {out ? (
          <span>
            ·{" "}
            <OutLink href={out} label={BILLING_KINDS.has(n.kind) ? "Billing" : n.vendor} />
          </span>
        ) : null}
      </p>
    </li>
  );
}

function DeployLine({ d, mail, now }: { d: FailedDeployment; mail: Notice | null; now: number }) {
  const repo = d.name.replace(/ \([^)]*\)$/, "");
  return (
    <li className={LINE}>
      <span className="num hidden text-right text-[12px] whitespace-nowrap text-fg-3 sm:block sm:pt-[2px]" title={d.at ? `Failing since ${absoluteTime(d.at)}` : undefined}>
        {d.at ? ago(d.at, now) : ""}
      </span>
      <Dot tone="red" />
      <p className="flex min-w-0 items-center gap-1 text-[14px] leading-[1.45] text-fg">
        <span className="min-w-0 lg:truncate">
          <span className="font-medium">{d.provider ?? mail?.vendor ?? "GitHub"}</span>: Deploy failed, {repo}
          {d.environment ? <span className="text-fg-2"> ({d.environment})</span> : null}
        </span>
      </p>
      <p className="col-start-2 mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-fg-3 sm:col-start-3 lg:col-start-4 lg:mt-0 lg:justify-end">
        <span title={`Source: GitHub deployments, the latest state for this environment${mail ? `, and mail to ${mail.inbox}` : ""}`}>
          Deploy · GitHub{mail ? ` and ${mail.vendor} mail` : ""}
        </span>
        {d.at ? <span className="sm:hidden">· failing for {ago(d.at, now).replace(" ago", "")}</span> : null}
        {d.url ? (
          <span className="inline-flex items-center">
            ·{" "}
            <span className="ml-1.5">
              <OutLink href={d.url} label="Open deploy" />
            </span>
            <CopyButton value={d.url} label="Copy deploy URL" />
          </span>
        ) : mail?.vendorUrl ? (
          <span>
            ·{" "}
            <OutLink href={mail.vendorUrl} label={mail.vendor} />
          </span>
        ) : null}
      </p>
    </li>
  );
}
