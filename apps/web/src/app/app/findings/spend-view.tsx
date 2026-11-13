"use client";
/**
 * Spend: what you pay every month for work, what is about to renew, and what can go.
 * Work only in the headline; personal is listed and never summed; unsorted vendors wait
 * for the user's call, which sticks. Every figure says where it came from.
 */
import { SpendBar } from "./spend-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Ticker } from "@/components/ticker";
import { Chevron, Empty, ErrorLine, Meter, buttonStyles, surface, Parts } from "@/components/ui";
import { apiPost, formatInt, useApi } from "@/components/use-api";
import { UNLINKED, describeFilters, filterFindings, filterNotices, filterSpend, isFiltered, parseSpendFilters, type SpendFilters } from "@/lib/spend-filter";
import { etaWords } from "@/lib/sync-eta";
import { BillingMail, type VendorsReport } from "../billing-mail";
import { isRunning, type Connection } from "../connection-model";
import { FINDING_LABEL, absoluteTime, plural, relativeTime, shortDate, type Finding, type FindingStatus, type Findings, type Spend, type Subscription } from "../data-model";
import { inboxNamer, type ActivityReport, type Notice } from "../project-model";
import { ScopeControl } from "../scope-control";
import { cadenceNote, canGo, dueDate, dueItems, money, roundMoney, repoLabeler, rowTrailer, scopeOf, viewFacets, viewSpend, type ScopeOverrides } from "../spend-model";
import { DueStrip, VendorBars } from "./spend-charts";

const GMAIL_START = "/api/connect/gmail/start?next=/app/findings";

export function SpendView() {
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync) || reading(c)) ? 3000 : null),
  });
  const spend = useApi<Spend>("/api/v1/spend");
  const list = useApi<Findings>("/api/v1/findings");
  const activity = useApi<ActivityReport>("/api/v1/activity");
  const vendors = useApi<VendorsReport>("/api/v1/mail/vendors");
  // The clock is read in effects only: a render-time Date.now() blocks prerendering.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const { reload: reloadSpend } = spend;
  const { reload: reloadFindings } = list;

  // While receipts are being read, the total and the findings fill on the poll's cadence.
  useEffect(() => {
    if (!conns.data) return;
    setNow(Date.now());
    if (conns.data.connections.some(reading)) {
      void reloadSpend();
      void reloadFindings();
    }
  }, [conns.data, reloadSpend, reloadFindings]);

  // Not landed yet (404) reads as "nothing read", not as an error.
  const quiet = (s: { status: number | null; error: string | null }) => (s.status === 404 ? null : s.error);

  return (
    <SpendScreen
      connections={now === null ? null : (conns.data?.connections ?? null)}
      spend={spend.status === 404 ? null : spend.data}
      findings={list.status === 404 ? [] : (list.data?.findings ?? null)}
      notices={activity.data?.items ?? []}
      vendors={vendors.data}
      now={now ?? 0}
      error={conns.error ?? quiet(spend) ?? quiet(list)}
      onMark={async (id, status) => {
        const r = await apiPost(`/api/v1/findings/${id}`, { status });
        return r.ok ? null : (r.error ?? "That didn't save. Try again.");
      }}
      onScope={async (vendorKey, scope) => {
        const r = await apiPost(`/api/v1/vendors/${encodeURIComponent(vendorKey)}/scope`, { scope });
        if (!r.ok) return r.error ?? "That didn't save. Try again.";
        // The server recomputes findings on a scope change; refetch both quietly.
        void reloadSpend();
        void reloadFindings();
        return null;
      }}
    />
  );
}

const reading = (c: Connection) => Boolean(c.sync?.reading && c.sync.reading.done < c.sync.reading.total);

/** Billing emails queued for reading across every inbox, or null when nothing is queued. */
function readingTotals(connections: Connection[]): { done: number; total: number; inboxes: number } | null {
  const rs = connections.filter(reading).map((c) => c.sync!.reading!);
  if (!rs.length) return null;
  return { done: rs.reduce((a, r) => a + r.done, 0), total: rs.reduce((a, r) => a + r.total, 0), inboxes: rs.length };
}

/** Time left from the observed reading rate across polls. Null until two samples show progress. */
function useEta(done: number | null, total: number | null): string | null {
  const samples = useRef<{ t: number; done: number }[]>([]);
  const [eta, setEta] = useState<string | null>(null);
  useEffect(() => {
    if (done === null || total === null) {
      samples.current = [];
      setEta(null);
      return;
    }
    const s = samples.current;
    const t = Date.now();
    if (!s.length || s[s.length - 1].done !== done) s.push({ t, done });
    while (s.length > 12) s.shift();
    const first = s[0];
    const last = s[s.length - 1];
    const rate = last.t > first.t ? (last.done - first.done) / ((last.t - first.t) / 1000) : 0;
    setEta(rate > 0 ? etaWords((total - done) / rate) : null);
  }, [done, total]);
  return eta;
}

/**
 * Project and address filters, kept in the URL (`?project=owner/repo&inbox=address`) so a
 * filtered Spend is a link you can share. Same parameters as GET /api/v1/spend.
 */
function useSpendFilters(): [SpendFilters, (f: SpendFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.toString();
  const filters = useMemo(() => parseSpendFilters(new URLSearchParams(query)), [query]);
  const set = useCallback(
    (f: SpendFilters) => {
      const q = new URLSearchParams(query);
      q.delete("project");
      q.delete("inbox");
      for (const p of f.project) q.append("project", p);
      for (const i of f.inbox) q.append("inbox", i);
      const next = q.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [query, pathname, router],
  );
  return [filters, set];
}

type Mark = (id: string, status: FindingStatus) => Promise<string | null>;
type SetScope = (vendorKey: string, scope: "work" | "personal") => Promise<string | null>;

export function SpendScreen({
  connections,
  spend,
  findings,
  notices = [],
  vendors = null,
  now,
  error,
  onMark,
  onScope,
}: {
  connections: Connection[] | null;
  spend: Spend | null;
  findings: Finding[] | null;
  /** Mail notices (renewals, trials) for the 60-day strip. */
  notices?: Notice[];
  /** Billing mail by vendor, from headers: shown while nothing is summed yet. */
  vendors?: VendorsReport | null;
  now: number;
  error: string | null;
  /** Saves a verdict. Resolves to an error message, or null when it saved. */
  onMark: Mark;
  /** Saves a work or personal call. Resolves to an error message, or null when it saved. */
  onScope: SetScope;
}) {
  const loading = connections === null && !error;
  const inboxes = (connections ?? []).filter((c) => c.provider === "gmail" && c.status !== "revoked");
  const r = readingTotals(connections ?? []);
  const eta = useEta(r?.done ?? null, r?.total ?? null);
  const hasSpend = Boolean(spend && spend.subscriptions.length);
  const [filters, setFilters] = useSpendFilters();
  const shown = useMemo(() => (spend ? filterSpend(spend, filters) : null), [spend, filters]);

  return (
    <>
      <header className="mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg">Spend</h1>
          {hasSpend ? (
            <span className="inline-flex items-center text-[14px] text-fg-2">
              Copy as JSON
              <CopyButton value={JSON.stringify(shown, null, 2)} label="Copy spend as JSON" />
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-[62ch] text-[16px] leading-[1.5] text-pretty text-fg-2">
          What you pay each month for work, what&apos;s about to renew, and what you can cancel.
        </p>
      </header>
      {error ? <ErrorLine message={error} /> : null}
      {loading ? <p className="text-[16px] text-fg-2">Loading…</p> : null}

      {!loading && !inboxes.length ? (
        <Empty
          title="No inbox connected."
          action={
            <a href={GMAIL_START} className={buttonStyles.primary}>
              Connect Gmail
            </a>
          }
        >
          <p>Spend comes from the receipts in your inbox. Access is read-only, and we only read billing mail.</p>
        </Empty>
      ) : null}

      {!loading && inboxes.length && !hasSpend ? (
        <>
          <ReadingHero reading={r} eta={eta} />
          {vendors && vendors.messages > 0 ? <BillingMail report={vendors} now={now} showEmpty={false} /> : null}
        </>
      ) : null}

      {!loading && inboxes.length && hasSpend ? (
        <SpendBody
          spend={spend!}
          findings={findings ?? []}
          notices={notices}
          now={now}
          reading={r}
          eta={eta}
          filters={filters}
          onFilters={setFilters}
          onMark={onMark}
          onScope={onScope}
        />
      ) : null}
    </>
  );
}

/** A section: its name, then its question in plain words, then the picture. */
function Section({ id, title, question, aside, children }: { id: string; title: string; question: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-16 scroll-mt-8">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={id} className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
          {title}
        </h2>
        {aside}
      </div>
      <p className="-mt-3 mb-5 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">{question}</p>
      {children}
    </section>
  );
}

/** A folded group: closed by default, its count beside the name. */
function Fold({ id, title, count, note, children }: { id: string; title: string; count: string; note: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby={id} className="mb-6 border-t border-line-1 pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 py-1 text-left"
      >
        <span className="text-fg-3 group-hover:text-fg-2">
          <Chevron open={open} />
        </span>
        <h2 id={id} className="text-[16px] leading-[1.3] font-medium text-fg">
          {title}
        </h2>
        <span className="num text-[14px] text-fg-2">{count}</span>
        <span className="w-full pl-[26px] text-[14px] text-fg-3 sm:w-auto sm:pl-0">{note}</span>
      </button>
      {open ? (
        <div id={`${id}-body`} className="mt-2 pl-0 sm:pl-[26px]">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SpendBody({
  spend,
  findings,
  notices,
  now,
  reading,
  eta,
  filters,
  onFilters,
  onMark,
  onScope,
}: {
  spend: Spend;
  findings: Finding[];
  notices: Notice[];
  now: number;
  reading: ReturnType<typeof readingTotals>;
  eta: string | null;
  filters: SpendFilters;
  onFilters: (f: SpendFilters) => void;
  onMark: Mark;
  onScope: SetScope;
}) {
  const [overrides, setOverrides] = useState<ScopeOverrides>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<Record<string, string>>({});

  // Once the server reports the call, the local one is no longer needed.
  useEffect(() => {
    setOverrides((o) => {
      const left = Object.fromEntries(
        Object.entries(o).filter(([k, v]) => !spend.subscriptions.some((s) => s.vendorKey === k && s.scope === v)),
      ) as ScopeOverrides;
      return Object.keys(left).length === Object.keys(o).length ? o : left;
    });
  }, [spend]);

  // Filter first, on the server's scopes, then apply the user's pending calls: the same order the API uses.
  const on = isFiltered(filters);
  const shown = useMemo(() => filterSpend(spend, filters), [spend, filters]);
  const facets = useMemo(() => viewFacets(spend, overrides, filters), [spend, overrides, filters]);
  const v = useMemo(() => viewSpend(shown, overrides), [shown, overrides]);
  const shownNotices = useMemo(() => filterNotices(notices, shown.subscriptions, filters), [notices, shown, filters]);
  const shownFindings = useMemo(() => filterFindings(findings, shown.subscriptions, filters), [findings, shown, filters]);
  const due = useMemo(() => dueItems(shown, shownNotices, overrides, now), [shown, shownNotices, overrides, now]);
  const going = useMemo(() => canGo(shownFindings), [shownFindings]);
  const manyAddresses = facets.inboxes.length > 1;
  // The address most of the money arrives at needs no naming on every row.
  const usual = useMemo(() => facets.inboxes.slice(0, 1).map((i) => i.address), [facets]);
  const repoLabel = useMemo(() => repoLabeler(facets.projects.map((p) => p.key)), [facets]);
  const trailer = useCallback((s: Subscription) => rowTrailer(s, filters, usual, repoLabel), [filters, usual, repoLabel]);
  // The unfiltered view: bars keep its scale so a small project's bills look small, the caption
  // quotes its total, and a phishing warning comes from it so no filter can hide one.
  const all = useMemo(() => viewSpend(spend, overrides), [spend, overrides]);
  const barMax = useMemo(() => Math.max(1, ...all.work.map((s) => s.monthlyCents ?? 0)), [all]);
  const allWorkCents = all.workCents;
  const inboxName = useMemo(() => inboxNamer(spend.subscriptions.flatMap((s) => [s.inbox, ...s.inboxes])), [spend]);
  const unknownVendors = new Set(v.unknown.map((s) => s.vendorKey)).size;

  const setScope = useCallback(
    async (s: Subscription, next: "work" | "personal") => {
      const before = overrides[s.vendorKey];
      setBusy(s.vendorKey);
      setScopeError(({ [s.vendorKey]: _, ...rest }) => rest);
      setOverrides((o) => ({ ...o, [s.vendorKey]: next }));
      const err = await onScope(s.vendorKey, next);
      setBusy(null);
      if (err) {
        setOverrides(({ [s.vendorKey]: _, ...rest }) => (before ? { ...rest, [s.vendorKey]: before } : rest));
        setScopeError((m) => ({ ...m, [s.vendorKey]: err }));
        return;
      }
      setSaid(`${s.vendor} is ${next} now.${next === "work" ? " It counts in the total." : " It's out of the total."}`);
    },
    [overrides, onScope],
  );

  const scopeRow = (s: Subscription) => (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <ScopeControl vendor={s.vendor} scope={scopeOf(s, overrides)} busy={busy === s.vendorKey} onChange={(n) => void setScope(s, n)} />
      {scopeError[s.vendorKey] ? <p className="text-[12px] text-red">{scopeError[s.vendorKey]}</p> : null}
    </div>
  );

  const vendorCount = new Set(v.work.map((s) => s.vendorKey)).size;
  const goingCents = going.reduce((a, f) => a + (f.amountCents ?? 0), 0);
  const decide = due.filter((d) => d.tone === "amber" && d.at <= now + 30 * 86_400_000);
  const dueCents = due.filter((d) => d.work && d.cents !== null && (d.currency ?? spend.currency) === spend.currency).reduce((a, d) => a + (d.cents ?? 0), 0);
  const unknownLabel = plural(unknownVendors, "vendor", "vendors");
  const attention: { key: string; href: string; amber: boolean; text: ReactNode }[] = [];
  for (const s of all.unverified)
    attention.push({
      key: `fake-${s.id}`,
      href: "#bars-title",
      amber: true,
      text: (
        <>
          Possible phishing: a {s.vendor} bill for <span className="num font-mono">{money(s.monthlyCents ?? 0, s.currency)}</span> to {s.inbox} failed email
          checks. Not counted. Don&apos;t pay from that email.
        </>
      ),
    });
  if (decide.length)
    attention.push({
      key: "decide",
      href: "#due-title",
      amber: true,
      text: `${plural(decide.length, "renewal or trial needs", "renewals or trials need")} a decision by ${dueDate(decide[decide.length - 1].at)}`,
    });
  if (goingCents > 0)
    attention.push({
      key: "go",
      href: "#go-title",
      amber: false,
      text: (
        <>
          <span className="num font-mono">{money(goingCents, spend.currency)}</span>/mo looks like it can go
        </>
      ),
    });
  if (v.unknownCents > 0)
    attention.push({
      key: "unknown",
      href: "#unknown-title",
      amber: false,
      text: (
        <>
          <span className="num font-mono">{money(v.unknownCents, spend.currency)}</span>/mo from {unknownLabel} waits for you to say work or personal
        </>
      ),
    });
  const vendors = (list: Subscription[]) => plural(new Set(list.map((s) => s.vendorKey)).size, "vendor", "vendors");

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>

      {/* Headline: the work total and where it came from. */}
      <section aria-labelledby="total-title" className="mb-16">
        <h2 id="total-title" className="sr-only">
          Work spend per month
        </h2>
        <p className="flex items-baseline gap-1 font-mono font-medium text-fg">
          <Figure cents={v.workCents} currency={spend.currency} />
          <span className="font-sans text-[20px] font-normal text-fg-2">/mo</span>
        </p>
        {on ? (
          <Parts className="mt-3 text-[16px] leading-[1.5] text-fg">
            <>
              of <span className="num font-mono text-[14px]">{money(allWorkCents, spend.currency)}</span> for work
            </>
            <span className="whitespace-nowrap">
              <span className="num">{shown.subscriptions.length}</span> of <span className="num">{plural(spend.subscriptions.length, "bill", "bills")}</span>
            </span>
            <span className="inline-flex items-baseline gap-x-3">
              <span className="font-mono text-[14px] break-all" title={describeFilters(filters)}>
                {[...filters.project.map((p) => (p === UNLINKED ? "not linked" : repoLabel(p))), ...filters.inbox].join(", ")}
              </span>
              <button
                type="button"
                onClick={() => onFilters({ project: [], inbox: [] })}
                className="-my-3 inline-flex h-11 items-center text-[14px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg sm:h-8"
              >
                Clear
              </button>
            </span>
          </Parts>
        ) : (
          <Parts className="mt-3 text-[16px] leading-[1.5] text-pretty text-fg">
            <>
              for work, from receipts in{" "}
              <span title={v.inboxes.join(", ")} className="whitespace-nowrap underline decoration-line-3 decoration-dotted underline-offset-4">
                {plural(v.inboxes.length, "inbox", "inboxes")}
              </span>
            </>
            <span className="whitespace-nowrap">{plural(vendorCount, "vendor", "vendors")}</span>
            <span className="whitespace-nowrap">personal not counted</span>
          </Parts>
        )}
        <SpendBar work={v.work} going={going} currency={spend.currency} />
        {attention.length ? (
          <ul aria-label="Needs a look" className="mt-5 flex flex-col gap-2 border-l border-line-2 pl-4">
            {attention.map((a) => (
              <li key={a.key} className="flex items-baseline gap-2.5 text-[14px] leading-[1.5] text-fg">
                <span aria-hidden className={`size-[7px] shrink-0 -translate-y-px self-center rounded-full ${a.amber ? "bg-amber" : "bg-fg-3"}`} />
                <a href={a.href} className="underline decoration-line-3 underline-offset-4 hover:decoration-fg">
                  {a.text}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <SpendFilterRows facets={facets} filters={filters} currency={spend.currency} repoLabel={repoLabel} figureCents={allWorkCents} onChange={onFilters} />
        <p className="mt-3 text-[14px] text-fg-3">Before tax. Annual plans spread by month, usage averaged over 3 months.</p>
        {reading ? (
          <div className="mt-6 max-w-sm">
            <p className="mb-2 text-[14px] text-fg-2">
              Still reading <span className="num font-mono text-fg">{formatInt(reading.done)}</span> of{" "}
              <span className="num font-mono text-fg">{formatInt(reading.total)}</span> billing emails
              {eta ? `, ${eta} left` : ""}. The total can still grow.
            </p>
            <Meter percent={Math.max(1, Math.round((reading.done / reading.total) * 100))} label="Billing mail read" />
          </div>
        ) : null}
      </section>

      {/* Picture 1: what is coming: the next charges sit above the vendor bars. */}
      <Section
        id="due-title"
        title="Next 60 days"
        aside={
          dueCents > 0 ? (
            <span className="text-[14px] text-fg-2">
              about <span className="num font-mono text-fg">{roundMoney(dueCents, spend.currency)}</span> due for work
            </span>
          ) : null
        }
        question={
          <>
            Charges we expect from past receipts, plus renewals and trials your vendors emailed about.{" "}
            <span className="whitespace-nowrap">
              <span aria-hidden className="mr-1.5 inline-block size-[7px] rounded-full bg-amber align-middle" />
              Amber means you need to decide.
            </span>
          </>
        }
      >
        {due.length ? <DueStrip items={due} now={now} /> : <p className="text-[14px] text-fg-2">Nothing expected in the next 60 days{on ? " for this filter" : ""}.</p>}
      </Section>

      {/* Picture 2: where the money goes. */}
      <Section
        id="bars-title"
        title="Where the money goes"
        question="Each work vendor per month, largest first. Open one to see its receipts or move it to personal."
      >
        {v.work.length ? (
          <VendorBars
            list={v.work}
            currency={spend.currency}
            trailer={trailer}
            max={barMax}
            detail={(s) => <SubDetail s={s} now={now} inboxName={inboxName} control={scopeRow(s)} />}
          />
        ) : on ? (
          <p className="text-[14px] text-fg-2">No work bills here.</p>
        ) : (
          <p className="text-[14px] text-fg-2">No work vendors yet. Sort the ones below and they show up here.</p>
        )}
        {v.foreign.length ? (
          <div className="mt-6">
            <h3 className="mb-1 text-[14px] text-fg-2">Billed in another currency. Not added in, since we don&apos;t guess exchange rates.</h3>
            <ul>
              {v.foreign.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-4 border-b border-line-1 py-2 last:border-b-0 sm:justify-start">
                  <span className="text-[14px] text-fg sm:w-[168px] sm:pl-5">{s.vendor}</span>
                  <span className="num font-mono text-[14px] text-fg-2">{money(s.monthlyCents ?? 0, s.currency)}/mo</span>
                  <Trailer parts={trailer(s)} className="hidden sm:block" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {/* Picture 3: what can go. */}
      <Section
        id="go-title"
        title="Can go"
        question="Things you pay for that look unused or doubled. Each one shows the receipts it rests on."
        aside={
          goingCents > 0 ? (
            <span className="text-[14px] text-fg-2">
              <span className="num font-mono text-fg">{money(goingCents, "USD")}</span>/mo if all of it goes
            </span>
          ) : null
        }
      >
        {going.length ? (
          <FindingList findings={shownFindings} going={going} now={now} onMark={onMark} />
        ) : (
          <p className="text-[14px] text-fg-2">Nothing looks unused or doubled{on ? " here" : " right now"}.</p>
        )}
      </Section>

      {v.unknown.length ? (
        <Section
          id="unknown-title"
          title="Unknown, you decide"
          question="We couldn't tell if these are work or personal. Your call sticks, and only work counts in the total."
          aside={<span className="num text-[14px] text-fg-2">{vendors(v.unknown)}</span>}
        >
          <SubList list={v.unknown} now={now} inboxName={inboxName} control={scopeRow} trailer={trailer} />
        </Section>
      ) : null}

      <div className="mb-16">
        {v.personal.length ? (
          <Fold
            id="personal-title"
            title="Personal, not counted"
            count={vendors(v.personal)}
            note="Listed so nothing hides. Never added to the total."
          >
            <SubList list={v.personal} now={now} inboxName={inboxName} control={scopeRow} trailer={trailer} />
          </Fold>
        ) : null}
        {v.stopped.length ? (
          <Fold id="stopped-title" title="Stopped" count={vendors(v.stopped)} note="No recent receipt. Not counted.">
            <ul className={`overflow-hidden ${surface}`}>
              {v.stopped.map((s) => (
                <li key={s.id} className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line-1 px-4 py-3 last:border-b-0">
                  <span className="text-[14px] text-fg">
                    {s.vendor}
                    {s.plan ? <span className="text-fg-2"> {s.plan}</span> : null}
                  </span>
                  <span className="text-[12px] text-fg-3" title={absoluteTime(s.lastBilledAt)}>
                    last billed {shortDate(s.lastBilledAt)} · {plural(s.receipts, "receipt", "receipts")} in {inboxName(s.inbox)}
                  </span>
                  <Trailer parts={trailer(s).filter((x) => x !== s.inbox.toLowerCase())} className="w-full" />
                </li>
              ))}
            </ul>
          </Fold>
        ) : null}
      </div>
    </>
  );
}

/** The hero figure: dollars at full size, cents and currency mark smaller so the number reads first. */
function Figure({ cents, currency }: { cents: number; currency: string }) {
  const text = money(cents, currency);
  const m = /^([^\d]*)([\d,]+)(\.\d+)?/.exec(text);
  return (
    <span className="num inline-flex items-baseline text-[48px] leading-none tracking-[-0.035em] sm:text-[64px]">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="mr-[0.06em] self-start text-[0.5em] leading-[1.4] text-fg-2">
        {m?.[1] ?? ""}
      </span>
      <span aria-hidden className="inline-flex">
        <Ticker value={m?.[2] ?? text} />
      </span>
      {m?.[3] ? (
        <span aria-hidden className="-ml-[0.08em] text-[0.5em] tracking-[-0.02em] text-fg-2">
          {m[3]}
        </span>
      ) : null}
    </span>
  );
}

/** The facts behind one line, each with its source. */
function SubDetail({ s, now, inboxName, control }: { s: Subscription; now: number; inboxName: (a: string) => string; control: ReactNode }) {
  const inboxes = s.inboxes.length ? s.inboxes : [s.inbox];
  const facts: [string, ReactNode][] = [
    ["Plan", s.plan ?? "not named on the receipt"],
    [
      "Billed",
      <>
        {s.cadence === "annual" ? "Yearly" : s.cadence === "usage" ? "By usage" : s.cadence === "monthly" ? "Monthly" : "Unclear"}
        {cadenceNote(s) ? <span className="text-fg-3"> · {cadenceNote(s)}</span> : null}
      </>,
    ],
    [
      "Receipts",
      <>
        {plural(s.receipts, "receipt", "receipts")} in{" "}
        <span className="font-mono" title={inboxes.join(", ")}>
          {inboxes.map(inboxName).join(", ")}
        </span>
      </>,
    ],
    ["Last billed", <span key="l" title={absoluteTime(s.lastBilledAt)}>{relativeTime(s.lastBilledAt, now)}</span>],
  ];
  if (s.nextExpectedAt) facts.push(["Next charge", <span key="n" title={absoluteTime(s.nextExpectedAt)}>expected {shortDate(s.nextExpectedAt)}</span>]);
  if (s.accountEmails.some((a) => !inboxes.includes(a)))
    facts.push(["Billed to", <span key="b" className="font-mono break-all">{s.accountEmails.join(", ")}</span>]);
  if (s.projects.length) facts.push(["Projects", <span key="p" className="font-mono break-all">{s.projects.join(", ")}</span>]);
  else if (s.projectNames.length)
    facts.push([
      "Projects",
      <span key="p">
        receipts name <span className="font-mono">{s.projectNames.join(", ")}</span>
        <span className="text-fg-3">, no repo matches</span>
      </span>,
    ]);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
        {facts.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="min-w-0 text-fg-2">{val}</dd>
          </div>
        ))}
      </dl>
      {control}
    </div>
  );
}

/** Unsorted or personal lines: vendor, amount, source, and the work or personal call. */
function SubList({
  list,
  now,
  inboxName,
  control,
  trailer,
}: {
  list: Subscription[];
  now: number;
  inboxName: (a: string) => string;
  control: (s: Subscription) => ReactNode;
  /** Repos and addresses not already said by the filter. Empty: the receipt line names the inbox. */
  trailer: (s: Subscription) => string[];
}) {
  return (
    <ul className={`overflow-hidden ${surface}`}>
      {list.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 border-b border-line-1 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-3 text-[14px] text-fg">
              <span>
                {s.vendor}
                {s.plan ? <span className="text-fg-2"> {s.plan}</span> : null}
              </span>
              {s.monthlyCents !== null ? (
                <span className="num font-mono text-fg-2">
                  {money(s.monthlyCents, s.currency)}
                  <span className="text-[12px] text-fg-3">/mo</span>
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[12px] text-fg-3">
              {[cadenceNote(s), `${plural(s.receipts, "receipt", "receipts")} in ${inboxName(s.inbox)}`, `last billed ${relativeTime(s.lastBilledAt, now)}`]
                .filter(Boolean)
                .join(" · ")}
              {!s.verified ? <span className="text-amber"> · sender failed email checks</span> : null}
            </p>
            <Trailer parts={trailer(s).filter((x) => x !== s.inbox.toLowerCase())} className="mt-0.5" />
          </div>
          {control(s)}
        </li>
      ))}
    </ul>
  );
}

/** Nothing summed yet: the wait is the hero, with a count and, once measurable, an ETA. */
function ReadingHero({ reading, eta }: { reading: ReturnType<typeof readingTotals>; eta: string | null }) {
  if (!reading) {
    return (
      <Empty title="Nothing read yet.">
        <p>
          Receipts are read for amounts and dates once an inbox finishes its first sync. The total shows up here as soon as the
          first ones are read.
        </p>
      </Empty>
    );
  }
  const pct = Math.max(1, Math.round((reading.done / reading.total) * 100));
  return (
    <section aria-labelledby="reading-title" className="mb-16">
      <h2 id="reading-title" className="text-[20px] leading-[1.25] font-medium text-fg">
        Reading billing mail
      </h2>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 font-mono font-medium text-fg">
        <Ticker value={formatInt(reading.done)} className="num text-[48px] leading-none tracking-[-0.035em]" />
        <span className="num text-[20px] text-fg-2">of {formatInt(reading.total)}</span>
      </p>
      <p className="mt-3 text-[16px] text-fg-2">
        billing emails read in {plural(reading.inboxes, "inbox", "inboxes")}
        {eta ? `, ${eta} left` : ""}.
      </p>
      <div className="mt-5 max-w-md">
        <Meter percent={pct} label="Billing mail read" />
      </div>
      <p className="mt-5 max-w-[60ch] text-[16px] leading-[1.5] text-pretty text-fg-2">
        Each receipt is read for its vendor, plan, amount and date, then checked before it counts. Nothing has passed those
        checks yet, so there&apos;s no total to show. Nothing here is estimated.
      </p>
    </section>
  );
}

const confidenceWord = (c: number) => `confidence: ${c >= 0.9 ? "high" : c >= 0.7 ? "medium" : "low"}`;

function FindingList({ findings, going, now, onMark }: { findings: Finding[]; going: Finding[]; now: number; onMark: Mark }) {
  const [local, setLocal] = useState<Record<string, FindingStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showWrong, setShowWrong] = useState(false);
  const status = (f: Finding) => local[f.id] ?? f.status;
  // A row marked wrong here stays put, struck through, until the next load: nothing jumps.
  const rows = going.length ? going : [];
  const dismissed = findings.filter((f) => f.status === "dismissed" && !rows.includes(f));

  const mark = async (f: Finding, s: FindingStatus) => {
    const before = status(f);
    setLocal((m) => ({ ...m, [f.id]: s }));
    setErrors(({ [f.id]: _, ...rest }) => rest);
    const err = await onMark(f.id, s);
    if (err) {
      setLocal((m) => ({ ...m, [f.id]: before }));
      setErrors((m) => ({ ...m, [f.id]: err }));
    }
  };

  return (
    <>
      <ul className={`overflow-hidden ${surface}`}>
        {rows.map((f) => (
          <FindingRow key={f.id} f={f} status={status(f)} error={errors[f.id]} now={now} onMark={(s) => mark(f, s)} />
        ))}
      </ul>
      {dismissed.length ? (
        <>
          <button
            type="button"
            aria-expanded={showWrong}
            onClick={() => setShowWrong((v) => !v)}
            className="mt-2 inline-flex h-11 items-center gap-2 text-[14px] text-fg-2 hover:text-fg sm:h-9"
          >
            <Chevron open={showWrong} className="size-3" />
            {plural(dismissed.length, "finding", "findings")} you marked wrong
          </button>
          {showWrong ? (
            <ul className={`overflow-hidden ${surface}`}>
              {dismissed.map((f) => (
                <FindingRow key={f.id} f={f} status={status(f)} error={errors[f.id]} now={now} onMark={(s) => mark(f, s)} />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function FindingRow({
  f,
  status,
  error,
  now,
  onMark,
}: {
  f: Finding;
  status: FindingStatus;
  error?: string;
  now: number;
  onMark: (s: FindingStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ev = f.evidence;
  const n = ev.receiptIds.length;
  const panelId = `evidence-${f.id}`;
  const host = f.actionUrl ? f.actionUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : null;
  const wrong = status === "dismissed";

  return (
    <li className={`border-b border-line-1 px-4 py-4 last:border-b-0 sm:px-5 ${wrong ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={`text-[16px] leading-[1.35] font-medium text-balance text-fg ${wrong ? "line-through decoration-fg-3" : ""}`}>{f.title}</h3>
          <p className="mt-1 text-[12px] text-fg-2" title={`Confidence ${Math.round(f.confidence * 100)}%`}>
            {[FINDING_LABEL[f.kind], n ? `${plural(n, "receipt", "receipts")}${ev.inbox ? ` in ${ev.inbox}` : ""}` : null, ev.repo && ev.lastActivityAt ? `last push ${relativeTime(ev.lastActivityAt, now)}` : null, confidenceWord(f.confidence)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {f.amountCents !== null ? (
          <p className="num shrink-0 text-right font-mono text-[16px] text-fg">
            {money(f.amountCents, f.currency)}
            <span className="text-[12px] text-fg-3">/mo</span>
          </p>
        ) : null}
      </div>

      <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">{f.action}</p>

      {open ? (
        <div id={panelId} className="mt-3 border-l border-line-2 pl-4">
          <ul className="flex flex-col gap-1.5">
            {ev.subjects.map((s, i) => (
              <li key={`${s}-${i}`} className="flex min-w-0 flex-wrap items-center gap-x-3">
                <span className="min-w-0 text-[14px] text-fg">“{s}”</span>
                {ev.receiptIds[i] ? (
                  <span className="inline-flex items-center">
                    <span className="font-mono text-[12px] text-fg-3">{ev.receiptIds[i]}</span>
                    <CopyButton value={ev.receiptIds[i]} label="Copy receipt id" />
                  </span>
                ) : null}
              </li>
            ))}
            {ev.repo ? (
              <li className="text-[14px] text-fg-2">
                <span className="font-mono text-fg">{ev.repo}</span>
                {ev.lastActivityAt ? `, last push ${relativeTime(ev.lastActivityAt, now)} (GitHub)` : ""}
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-[12px] text-fg-3" title={absoluteTime(f.computedAt)}>
            Worked out {relativeTime(f.computedAt, now)}. Subjects only; message bodies are never stored.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-red">{error}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        {n || ev.repo ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-lg px-1 text-[14px] text-fg-2 hover:text-fg sm:h-8"
          >
            <Chevron open={open} className="size-3" />
            Evidence
          </button>
        ) : null}
        {f.actionUrl && host ? (
          <a
            href={f.actionUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-1 px-2 text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg sm:h-8"
          >
            Cancel at {host}
            <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3.5h6.5V10M12.5 3.5 4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1">
          {status === "open" ? (
            <>
              <span className="mr-1 text-[14px] text-fg-3">Is this right?</span>
              <button type="button" className={buttonStyles.secondary} onClick={() => onMark("confirmed")}>
                Yes
              </button>
              <button type="button" className={buttonStyles.secondary} onClick={() => onMark("dismissed")}>
                No
              </button>
            </>
          ) : status === "confirmed" ? (
            <span className="inline-flex h-11 items-center gap-2 text-[14px] text-fg-2 sm:h-8">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3 8.5 6.5 12 13 4.5" />
              </svg>
              You said this is right
            </span>
          ) : (
            <span className="inline-flex h-11 items-center gap-2 text-[14px] text-fg-2 sm:h-8">
              Marked wrong. It won&apos;t come back.
              <button type="button" className="text-fg underline decoration-line-3 underline-offset-4" onClick={() => onMark("open")}>
                Undo
              </button>
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** Repos and addresses on a row, tertiary and mono: what a chip above would match. */
function Trailer({ parts, className = "" }: { parts: string[]; className?: string }) {
  if (!parts.length) return null;
  return (
    <span className={`block truncate font-mono text-[12px] leading-[1.5] text-fg-3 ${className}`} title={parts.join(", ")}>
      {parts.join(" · ")}
    </span>
  );
}

type Facets = ReturnType<typeof viewFacets>;

/**
 * Two rows of chips under the figure: projects (repo, its work total), then addresses. One pick per
 * row; picking the picked chip again goes back to All. A chip that would match nothing under the
 * other row's pick dims but keeps its place. Phones scroll the chips; the row's label stays put.
 */
function SpendFilterRows({
  facets,
  filters,
  currency,
  repoLabel,
  figureCents,
  onChange,
}: {
  facets: Facets;
  filters: SpendFilters;
  currency: string;
  repoLabel: (name: string) => string;
  /** The unfiltered work total: the overlap note shows only when chip totals pass it. */
  figureCents: number;
  onChange: (f: SpendFilters) => void;
}) {
  const repos = facets.projects.filter((p) => p.key !== UNLINKED);
  // A value in the URL that matches nothing still shows, picked, so it can be cleared.
  const extra = (picked: string[], known: string[]) => picked.filter((p) => !known.some((k) => k.toLowerCase() === p.toLowerCase()));
  const projectKeys = [...facets.projects.map((p) => p.key), ...extra(filters.project, facets.projects.map((p) => p.key))];
  const addressKeys = [...facets.inboxes.map((i) => i.address), ...extra(filters.inbox, facets.inboxes.map((i) => i.address))];
  const showProjects = repos.length > 0 || filters.project.length > 0;
  const showAddresses = facets.inboxes.length > 1 || filters.inbox.length > 0;
  // Wider screens show the biggest repos on one line and fold the rest; phones scroll the whole row.
  const [more, setMore] = useState(false);
  if (!showProjects && !showAddresses) return null;
  const isOn = (list: string[], k: string) => list.some((x) => x.toLowerCase() === k.toLowerCase());
  const pick = (list: string[], k: string) => (isOn(list, k) && list.length === 1 ? [] : [k]);
  const project = (k: string) => facets.projects.find((p) => p.key === k);
  const inbox = (k: string) => facets.inboxes.find((i) => i.address === k);
  const folded = projectKeys.filter((k, i) => k !== UNLINKED && i >= FIRST_REPOS && !isOn(filters.project, k));
  const over = (list: { monthlyCents: number }[]) => list.reduce((a, x) => a + x.monthlyCents, 0) > figureCents;
  const overlap = (showProjects && facets.shared && over(facets.projects)) || (showAddresses && facets.sharedAddress && over(facets.inboxes));

  return (
    <div className="mt-5 flex flex-col">
      {showProjects ? (
        <ChipRow label="Project">
          <Chip on={!filters.project.length} all onClick={() => onChange({ ...filters, project: [] })}>
            <span className="font-mono">All</span>
          </Chip>
          {projectKeys.map((k) => {
            const p = project(k);
            return (
              <Chip
                key={k}
                on={isOn(filters.project, k)}
                dim={!p || p.lines === 0 || !p.monthlyCents}
                fold={!more && folded.includes(k)}
                title={k === UNLINKED ? "Bills no repo claims" : k}
                onClick={() => onChange({ ...filters, project: pick(filters.project, k) })}
              >
                <span className="font-mono">{k === UNLINKED ? "not linked" : repoLabel(k)}</span>
                {p && p.monthlyCents > 0 ? <span className="num font-mono text-[12px] text-fg-3">{roundMoney(p.monthlyCents, currency)}</span> : null}
              </Chip>
            );
          })}
          {folded.length ? (
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((m) => !m)}
              className="hidden h-8 shrink-0 items-baseline gap-1.5 px-2 text-[12px] leading-8 text-fg-3 hover:text-fg sm:inline-flex"
            >
              {more ? "Fewer" : `${folded.length} more`}
              <Chevron open={more} className="size-3 self-center" />
            </button>
          ) : null}
        </ChipRow>
      ) : null}
      {showAddresses ? (
        <ChipRow label="Address">
          <Chip on={!filters.inbox.length} all onClick={() => onChange({ ...filters, inbox: [] })}>
            <span className="font-mono">All</span>
          </Chip>
          {addressKeys.map((k) => {
            const i = inbox(k);
            return (
              <Chip key={k} on={isOn(filters.inbox, k)} dim={!i || i.lines === 0 || !i.monthlyCents} title={k} onClick={() => onChange({ ...filters, inbox: pick(filters.inbox, k) })}>
                <span className="font-mono">{k}</span>
                {i && i.monthlyCents > 0 ? <span className="num font-mono text-[12px] text-fg-3">{roundMoney(i.monthlyCents, currency)}</span> : null}
              </Chip>
            );
          })}
        </ChipRow>
      ) : null}
      {overlap ? (
        <p className="mt-4 text-[14px] leading-[1.5] text-pretty text-fg-3">
          One bill can serve several repos or reach several addresses, so chip totals can add up to more than the total.
        </p>
      ) : null}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  // The left edge fades only once the row has scrolled, so the first chip is never cut.
  const [scrolled, setScrolled] = useState(false);
  const jumped = useRef<number | null>(null);
  // Opened from a shared link on a phone: bring the picked chip into the row's view, once.
  useEffect(() => {
    const el = row.current;
    const picked = el?.querySelectorAll<HTMLElement>('[aria-pressed="true"]')[0];
    if (!el || !picked || el.scrollWidth <= el.clientWidth || picked.offsetLeft + picked.offsetWidth < el.clientWidth - 24) return;
    // Flush against the label, with no fade, so no half chip shows beside it.
    el.scrollLeft = picked.offsetLeft - 16;
    jumped.current = el.scrollLeft;
    // The chip before it sits under the faded gutter, not cut at the screen edge.
    setScrolled(true);
  }, []);
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
      <span className="mt-4 -mb-1.5 text-[12px] text-fg-3 sm:mt-0 sm:mb-0 sm:w-16 sm:shrink-0">{label}</span>
      <div
        ref={row}
        onScroll={(e) => {
          const x = e.currentTarget.scrollLeft;
          if (jumped.current !== null && Math.abs(x - jumped.current) < 2) return;
          jumped.current = null;
          setScrolled(x > 4);
        }}
        className={`relative -mx-4 flex min-w-0 flex-1 items-baseline overflow-x-auto px-4 ${
          scrolled
            ? "[mask-image:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%-56px),transparent)]"
            : "[mask-image:linear-gradient(to_right,#000_calc(100%-56px),transparent)]"
        } [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden`}
      >
        {children}
      </div>
    </div>
  );
}

/** Repos shown before the fold on wider screens. "Not linked" and a picked repo always show. */
const FIRST_REPOS = 4;

/**
 * A quiet text control: no box, the label in mono 14 and its monthly total in tertiary mono 12.
 * The pick carries a 2px bar under the text, the same shape in both rows: the accent when it
 * filters, ink for "All", so the accent means "a filter is on". A 44px hit area on touch, 32px with a pointer. Only color and
 * the bar change.
 */
function Chip({
  on,
  all = false,
  dim = false,
  fold = false,
  title,
  onClick,
  children,
}: {
  on: boolean;
  /** The "All" chip: picked without the accent. */
  all?: boolean;
  dim?: boolean;
  fold?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  // "All" picked is the resting state: ink. A real filter carries the accent.
  const lit = on && !all;
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`${fold ? "sm:hidden" : ""} group flex h-11 shrink-0 items-center rounded-lg px-2 first:-ml-2 focus-visible:outline-offset-0 sm:h-8`}
    >
      <span
        className={`relative inline-flex h-7 items-baseline gap-1.5 text-[14px] leading-7 whitespace-nowrap transition-colors duration-150 after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:transition-[opacity,scale] after:duration-150 after:ease-out ${
          lit ? "after:bg-accent" : "after:bg-fg-2"
        } ${on ? "text-fg after:scale-x-100 after:opacity-100" : `${dim ? "text-fg-3" : "text-fg-2"} after:scale-x-50 after:opacity-0 group-hover:text-fg`}`}
      >
        {children}
      </span>
    </button>
  );
}

