"use client";
/**
 * One project in full, at /app/projects/{owner}/{repo}/details: where it runs, what it costs a month, what could be saved, then the rows
 * behind it (deployments, domains, services and bills), each with its owner and one way out.
 * Every number comes from GET /api/v1/projects/{owner}/{repo}; an agent with a read key sees
 * the same page as JSON. Read-only: recommendations link to the vendor, nothing is executed.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Empty, ErrorLine, Parts, surface } from "@/components/ui";
import { formatUsd, useApi } from "@/components/use-api";
import { touch } from "@/lib/analytics/client";
import type { DomainRow, EvidenceRow, HostSide, ProjectPage, Recommendation, ServiceRow } from "@/lib/project-page";
import { absoluteTime, plural } from "./data-model";
import { HEALTH, ago, deployWord, dueWords, host, inboxNamer, isFailedState } from "./project-model";
import { projectHref } from "./projects-view";

export function ProjectPageView({ owner, repo }: { owner: string; repo: string }) {
  const path = `/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const page = useApi<ProjectPage>(path);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [page.data]);
  return <ProjectPageScreen name={`${owner}/${repo}`} page={page.data} error={page.error} now={now ?? 0} ready={Boolean(page.data) && now !== null} />;
}

const money = (cents: number, currency: string | null) =>
  !currency || currency === "USD" ? formatUsd(cents) : `${(cents / 100).toFixed(2)} ${currency}`;

/** Out to the vendor, in a new tab: the one action a row has. Quiet in tables: underlined on hover and focus only. */
function OutLink({ href, quiet = false, children }: { href: string; quiet?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-11 items-center gap-1 text-[14px] whitespace-nowrap text-fg-2 underline-offset-4 transition-colors hover:text-fg hover:underline hover:decoration-fg focus-visible:underline sm:min-h-0 ${quiet ? "decoration-line-3" : "underline decoration-line-3"}`}
    >
      {children}
      <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5.5 3.5h7v7M12.5 3.5 4 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function When({ iso, now, prefix = "" }: { iso: string | null; now: number; prefix?: string }) {
  if (!iso) return null;
  return (
    <time dateTime={iso} title={absoluteTime(iso)} className="num whitespace-nowrap">
      {prefix}
      {ago(iso, now)}
    </time>
  );
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-2 pb-3">
        <h2 id={id} className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-balance text-fg">
          {title}
        </h2>
        {meta ? <p className="text-[12px] text-fg-3">{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A column header row, wide screens only; narrow rows stack. */
function Head({ cols, children }: { cols: string; children: ReactNode }) {
  return <div aria-hidden className={`hidden pb-2 text-[12px] text-fg-3 lg:grid ${cols}`}>{children}</div>;
}

export function ProjectPageScreen({ name, page, error, now, ready }: { name: string; page: ProjectPage | null; error: string | null; now: number; ready: boolean }) {
  const inboxName = useMemo(
    () =>
      inboxNamer(
        page
          ? [...page.cogs.sources, ...page.services.flatMap((g) => g.services.flatMap((s) => [s.inbox, s.owner])), ...page.domains.map((d) => d.receivedBy ?? "").filter(Boolean)]
          : [],
      ),
    [page],
  );

  const back = (
    <Link href={projectHref(name)} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] text-fg-3 transition-colors hover:text-fg sm:min-h-0">
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3.5 5.5 8 10 12.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono">{name}</span>
    </Link>
  );

  if (error) {
    return (
      <>
        <div className="mb-6">{back}</div>
        {/not_found|No connected repo/i.test(error) || /404/.test(error) ? (
          <Empty title={`No connected repo named ${name}`}>Check the name, or install the GitHub app on the account that owns it.</Empty>
        ) : (
          <ErrorLine message={error} />
        )}
      </>
    );
  }
  if (!ready || !page) {
    return (
      <>
        <div className="mb-6">{back}</div>
        <p className="text-[16px] text-fg-2">Loading {name}.</p>
      </>
    );
  }

  const p = page.project;
  const status = statusOf(page);
  const monthly = page.recommendations.filter((r) => r.per === "month" && r.amountCents !== null);
  const saveCents = monthly.reduce((a, r) => a + (r.amountCents ?? 0), 0);

  return (
    <article className="max-w-[1024px]">
      <div className="mb-6 flex items-center justify-between gap-3">
        {back}
        <span className="flex items-center gap-5">
          {p.url ? <OutLink href={p.url}>GitHub</OutLink> : null}
          <span className="inline-flex items-center text-[14px] text-fg-3">
            Copy as JSON
            <CopyButton value={JSON.stringify(page, null, 2)} label="Copy this project as JSON" />
          </span>
        </span>
      </div>

      {/* Header: the repo and one status word, then where it is, separated by dots. */}
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="min-w-0 font-mono text-[24px] leading-[1.1] font-medium tracking-[-0.02em] [overflow-wrap:anywhere] text-fg sm:text-[32px]">
            <span className="text-fg-3">{p.owner}/</span>
            <wbr />
            {p.repo}
          </h1>
          <span className={`inline-flex items-center gap-2 text-[14px] ${status.text}`} title={status.why}>
            <span aria-hidden className={`size-1.5 rounded-full ${status.dot}`} />
            {status.word}
          </span>
        </div>
        <Parts className="mt-3 text-[14px] text-fg-2">
          {[
            p.liveUrl ? (
              <a key="url" href={p.liveUrl} target="_blank" rel="noreferrer" className="font-mono break-all text-fg hover:underline">
                {host(p.liveUrl)}
              </a>
            ) : (
              <span key="url" className="text-fg-3">no deploy URL reported</span>
            ),
            p.host ? <span key="host">on {p.host}</span> : null,
            <span key="push">{p.lastPushAt ? <When iso={p.lastPushAt} now={now} prefix="pushed " /> : "no pushes"}</span>,
          ].filter(Boolean)}
        </Parts>
      </header>

      {page.elsewhere ? (
        <p className="mt-5 max-w-[80ch] text-[14px] text-fg-2">
          Runs on {page.elsewhere.host}. Move it to Vercel:{" "}
          <a href={page.elsewhere.importUrl} target="_blank" rel="noreferrer" onClick={() => touch("move_to_vercel_clicked", { from: page.elsewhere!.host })} className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">import this repo</a>
          {page.elsewhere.guideUrl ? <>, then follow <a href={page.elsewhere.guideUrl} target="_blank" rel="noreferrer" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">{page.elsewhere.guideTitle}</a></> : null}.
        </p>
      ) : null}

      {/* The answers: what it costs (and what of that could go), and what it's built on. */}
      <div className="mt-8 grid border-y border-line-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="py-6 lg:pr-10">
          <h2 className="text-[14px] text-fg-2">Spend per month</h2>
          <p className="num mt-2 font-mono text-[48px] leading-none font-medium tracking-[-0.02em] text-fg">{money(page.cogs.monthlyCents, page.cogs.currency)}</p>
          <p className="mt-3 max-w-[52ch] text-[14px] text-pretty text-fg-2">
            {page.cogs.bills ? (
              <>
                {plural(page.cogs.bills, "bill", "bills")}, receipts in{" "}
                {page.cogs.sources.map((s, i) => (
                  <span key={s}>
                    {i ? (i === page.cogs.sources.length - 1 ? " and " : ", ") : ""}
                    <span title={s}>{inboxName(s)}</span>
                  </span>
                ))}
                .
              </>
            ) : (
              "No work bill names this project yet."
            )}
            {page.cogs.shared.map((s) => (
              <span key={s.vendor + (s.plan ?? "")}>
                {" "}
                {s.vendor}
                {s.plan ? ` ${s.plan}` : ""} also serves {plural(s.otherProjects.length, "other project", "other projects")}; counted once here.
              </span>
            ))}
            {page.cogs.unknownMonthlyCents > 0 ? (
              <span>
                {" "}
                Plus <span className="num font-mono">{money(page.cogs.unknownMonthlyCents, page.cogs.currency)}</span> from vendors not yet marked work or personal.
              </span>
            ) : null}
          </p>
          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line-1 pt-4">
            <p className="flex items-baseline gap-3">
              <span className="text-[14px] text-fg-2">Could save</span>
              <span className="num font-mono text-[20px] font-medium text-fg">{money(saveCents, page.cogs.currency)}</span>
              <span className="text-[14px] text-fg-3">
                {monthly.length ? `a month, ${plural(monthly.length, "recommendation", "recommendations")}` : "nothing the data can prove"}
              </span>
            </p>
            <Link href={page.cogs.spendPath} className="text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
              See these bills on Spend
            </Link>
          </div>
        </div>

        <div className="border-t border-line-1 py-6 lg:border-t-0 lg:border-l lg:pl-10">
          <h2 className="text-[14px] text-fg-2">Stack</h2>
          <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-fg-3">Language</dt>
            <dd className="text-fg">{page.stack.language ?? <span className="text-fg-3">not read yet</span>}</dd>
            {page.stack.hosts.length ? (
              page.stack.hosts.map((h, i) => (
                <StackLine key={h.name} label={i ? "" : page.stack.hosts.length > 1 ? "Hosts" : "Host"}>
                  {h.name}
                  {h.seenIn.length === 1 ? <span className="text-[12px] text-fg-3"> {h.seenIn[0]} only</span> : null}
                </StackLine>
              ))
            ) : (
              <StackLine label="Host">
                <span className="text-fg-3">none seen</span>
              </StackLine>
            )}
            {page.stack.services.map((s) => (
              <StackLine key={s.category} label={s.label}>
                {s.vendors.join(", ")}
              </StackLine>
            ))}
          </dl>
          <p className="mt-4 text-[12px] text-fg-3">{page.stack.source}; hosts from deploys and hosting bills. Frameworks aren&apos;t guessed.</p>
        </div>
      </div>

      <section aria-labelledby="recs" className="mt-12">
        <div className="mb-4">
          <h2 id="recs" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
            Recommendations
          </h2>
          <p className="mt-1 text-[14px] text-fg-2">Savings and decisions, each with its evidence and a link to where you&apos;d act. Nothing runs from here.</p>
        </div>
        {page.recommendations.length ? (
          <ol className={`overflow-hidden ${surface}`}>
            {page.recommendations.map((r) => (
              <RecommendationItem key={r.id} r={r} now={now} inboxName={inboxName} spendPath={page.cogs.spendPath} repo={p.repo} />
            ))}
          </ol>
        ) : (
          <p className="max-w-[72ch] text-[14px] text-pretty text-fg-2">
            Nothing to cut that the data can prove. Checked: paid hosts and databases with no recent deploy, domains renewing with nothing live, two hosts for one repo, and the findings on Spend.
          </p>
        )}
      </section>

      <Section id="deploys" title="Deployments">
        {page.deployments.length ? (
          <>
            <Head cols={DEP_COLS}>
              <span>Environment</span>
              <span>State</span>
              <span>URL</span>
              <span>Host</span>
              <span>Deployed by</span>
              <span className="text-right">When</span>
              <span />
            </Head>
            <ul className="lg:border-t lg:border-line-1">
              {page.deployments.map((d, i) => (
                <DeployItem key={`${d.environment}-${i}`} d={d} now={now} />
              ))}
            </ul>
          </>
        ) : (
          <p className="py-2 text-[14px] text-fg-2">GitHub reports no deployments for this repo. Hosts that don&apos;t post deploys to GitHub show up once their account is connected.</p>
        )}
      </Section>

      <Section id="domains" title="Domains">
        {page.domains.length ? (
          <>
            <Head cols={DOM_COLS}>
              <span>Domain</span>
              <span>Seen in</span>
              <span>Registrar</span>
              <span>Renews</span>
              <span>Notice to</span>
              <span className="text-right">Renewal</span>
              <span />
            </Head>
            <ul className="lg:border-t lg:border-line-1">
              {page.domains.map((d) => (
                <DomainItem key={d.name} d={d} now={now} inboxName={inboxName} />
              ))}
            </ul>
          </>
        ) : (
          <p className="py-2 text-[14px] text-fg-2">No custom domain in this repo&apos;s deploys or in your domain mail.</p>
        )}
      </Section>

      <Section id="services" title="Services and bills">
        {page.services.length ? (
          <>
            <Head cols={SVC_COLS}>
              <span>Service</span>
              <span>Receipts in</span>
              <span>Shared with</span>
              <span className="text-right">Per month</span>
              <span />
            </Head>
            {page.services.map((g, i) => (
              <div key={g.category}>
                <h3 className={`pt-4 pb-1.5 text-[12px] font-medium text-fg-3 ${i ? "border-t border-line-1" : "lg:border-t lg:border-line-1"}`}>{g.label}</h3>
                <ul>
                  {g.services.map((s) => (
                    <ServiceItem key={s.id} s={s} inboxName={inboxName} />
                  ))}
                </ul>
              </div>
            ))}
            <div className={`mt-1 flex items-baseline justify-between gap-4 border-t border-line-2 py-3 lg:grid ${SVC_COLS}`}>
              <span className="text-[14px] text-fg-2 lg:col-span-3">
                Counted in spend per month: {plural(page.cogs.bills, "bill", "bills")}
                {page.cogs.notCounted ? `; ${page.cogs.notCounted} not counted (stopped, unverified or no amount)` : ""}
              </span>
              <span className="num text-right font-mono text-[14px] font-medium text-fg">{money(page.cogs.monthlyCents, page.cogs.currency)}</span>
              <span className="hidden lg:block" />
            </div>
          </>
        ) : (
          <p className="py-2 text-[14px] text-fg-2">No receipt in your inboxes names this repo or its domains.</p>
        )}
      </Section>

      <p className="mt-12 max-w-[72ch] text-[12px] text-pretty text-fg-3">
        Sources: GitHub repo metadata and deployments; receipts and notices in your inboxes. Not observed yet: {page.notObserved.join(", ")}. They need a host connection; nothing here is estimated.
      </p>
    </article>
  );
}

function DeployItem({ d, now }: { d: ProjectPage["deployments"][number]; now: number }) {
  const failed = isFailedState(d.state);
  const dot = <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${d.state === "success" ? "bg-live" : failed ? "bg-red" : "bg-fg-3"}`} />;
  const url = d.url ? (
    <span className="flex min-w-0 items-center gap-0.5">
      <a href={d.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[14px] text-fg hover:underline" title={d.url}>
        {host(d.url)}
      </a>
      <CopyButton value={d.url} label="Copy deploy URL" />
    </span>
  ) : (
    <span className="text-[14px] text-fg-3">no URL reported</span>
  );
  return (
    <li className={`border-b border-line-1 py-2.5 lg:grid lg:min-h-11 lg:items-center ${DEP_COLS}`}>
      <span className="hidden text-[14px] text-fg lg:block">{envName(d.environment)}</span>
      <span className={`hidden items-center gap-2 text-[14px] lg:inline-flex ${failed ? "text-red" : "text-fg-2"}`}>
        {dot}
        {deployWord(d.state)}
      </span>
      <span className="hidden min-w-0 lg:block">
        {d.url ? (
          <span className="flex min-w-0 items-center gap-0.5">
            <span className="truncate font-mono text-[14px] text-fg" title={d.url}>
              {host(d.url)}
            </span>
            <CopyButton value={d.url} label="Copy deploy URL" />
          </span>
        ) : (
          url
        )}
      </span>
      <span className="hidden text-[14px] text-fg-2 lg:block">{d.provider ?? <span className="text-fg-3">unknown</span>}</span>
      <span className="hidden truncate font-mono text-[14px] text-fg-2 lg:block">{d.creator ?? "unknown"}</span>
      <span className="hidden text-right text-[14px] text-fg-2 lg:block">
        <When iso={d.at} now={now} />
      </span>
      <span className="hidden text-right lg:block">{d.url ? <OutLink quiet href={d.url}>Open</OutLink> : null}</span>

      {/* Narrow: environment and state, then the URL, then host, who and when. */}
      <div className="lg:hidden">
        <p className="flex items-center gap-2 text-[14px]">
          {dot}
          <span className="text-fg">{envName(d.environment)}</span>
          <span className={failed ? "text-red" : "text-fg-2"}>{deployWord(d.state)}</span>
        </p>
        <div className="mt-0.5">{url}</div>
        <p className="text-[12px] text-fg-3">
          {[d.provider, d.creator].filter(Boolean).join(" · ")}
          {d.at ? (
            <>
              {d.provider || d.creator ? " · " : ""}
              <When iso={d.at} now={now} />
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/** "staging" reads as "Staging" beside "Production"; the raw value stays in the API. */
const envName = (e: string) => e.charAt(0).toUpperCase() + e.slice(1);

function StackLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-3">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </>
  );
}

/*
 * Fixed widths, so columns sit still whatever the data, and every table ends the same way: money
 * right-aligned in a 112px column where there is money, then a 72px column holding only the
 * row's one way out.
 */
const DEP_COLS = "lg:grid-cols-[104px_96px_minmax(0,1fr)_88px_120px_72px_72px] lg:gap-x-4";
const DOM_COLS = "lg:grid-cols-[minmax(200px,248px)_96px_112px_104px_minmax(0,1fr)_112px_72px] lg:gap-x-4";
const SVC_COLS = "lg:grid-cols-[minmax(0,1fr)_176px_minmax(0,1fr)_112px_72px] lg:gap-x-4";

/** What the check compared, in words, for the line under each recommendation. */
const RULE_NAME: Record<string, string> = {
  idle_paid_infra: "Compared this repo's bills with its last deploy",
  renewal_without_deploy: "Compared the renewal notice with this repo's deploys",
  two_hosts: "Compared this repo's hosting bills with where it deploys",
};

function RecommendationItem({ r, now, inboxName, spendPath, repo }: { r: Recommendation; now: number; inboxName: (a: string) => string; spendPath: string; repo: string }) {
  const renewal = r.per === "renewal" ? r.dueAt : null;
  // Two hosts with a clear candidate: the hosts side by side say what the action sentence would.
  const sides = r.hosts?.length ? r.hosts : null;
  const decided = Boolean(sides?.some((h) => h.candidate));
  return (
    <li className="border-b border-line-1 px-4 py-5 last:border-b-0 sm:px-6">
      <p className={`mb-1 text-[12px] ${r.per === "renewal" ? "text-amber" : "text-fg-3"}`}>{r.per === "renewal" ? "Decide before it renews" : "Saving"}</p>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h3 className="min-w-0 text-[16px] leading-[1.35] font-medium text-pretty text-fg">{r.title}</h3>
        {r.amountCents !== null ? (
          <span className="num shrink-0 font-mono text-[16px] text-fg sm:text-right">
            {r.per === "month" ? (
              <>
                <span className="font-sans text-[12px] text-fg-3">save </span>
                {money(r.amountCents, r.currency)}
                <span className="font-sans text-[12px] text-fg-3">/mo</span>
              </>
            ) : (
              <>
                {money(r.amountCents, r.currency)}
                {renewal ? <span className="font-sans text-[12px] text-fg-3"> on {shortDay(renewal)}</span> : null}
              </>
            )}
          </span>
        ) : null}
      </div>
      {decided ? null : <p className="mt-1 max-w-[72ch] text-[14px] text-pretty text-fg-2">{r.action}</p>}
      {sides ? (
        <div className="mt-4 grid divide-y divide-line-1 border-y border-line-1 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
          {sides.map((h) => (
            <HostCard key={h.vendor} h={h} now={now} inboxName={inboxName} repo={repo} />
          ))}
        </div>
      ) : (
        <dl className="mt-3 max-w-[760px]">
          {r.evidence.map((e, i) => (
            <Evidence key={i} e={e} now={now} inboxName={inboxName} />
          ))}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {r.billingUrl && !decided ? <OutLink href={r.billingUrl}>{r.vendor ? `${r.vendor} billing` : "Billing page"}</OutLink> : null}
        {r.source === "finding" ? (
          <Link href={spendPath} className="text-[12px] text-fg-3 underline decoration-line-2 underline-offset-4 hover:text-fg">
            Also a finding on Spend
          </Link>
        ) : (
          <span className="text-[12px] text-fg-3">{RULE_NAME[r.kind] ?? "Checked on this project"}</span>
        )}
      </div>
    </li>
  );
}

/**
 * One host of two, as a column of a split panel (no box inside the box): its plan and its one
 * money figure, the bill and the last deploy behind it, then what that means: production runs
 * here, or this is the one to cancel.
 */
function HostCard({ h, now, inboxName, repo }: { h: HostSide; now: number; inboxName: (a: string) => string; repo: string }) {
  const facts = [h.bill, h.deploy];
  return (
    <div className="flex flex-col py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="min-w-0 truncate text-[14px] font-medium text-fg">{h.name}</h4>
        {h.monthlyCents !== null ? (
          <span className="num shrink-0 font-mono text-[16px] text-fg">
            {money(h.monthlyCents, h.currency)}
            <span className="font-sans text-[12px] text-fg-3">/mo</span>
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-fg-3">amount unknown</span>
        )}
      </div>
      <dl className="mt-3 flex flex-col gap-2">
        {facts.map((e) => (
          <div key={e.label} className="grid items-baseline gap-x-4 sm:grid-cols-[88px_minmax(0,1fr)]">
            <dt className="text-[12px] text-fg-3">{e.label}</dt>
            <dd className="min-w-0">
              {e.label === "Bill" ? null : <span className="block text-[14px] text-pretty text-fg">{withHosts(e.value)}</span>}
              <span className="block text-[12px] text-fg-3" title={e.source}>
                {e.at ? (
                  <>
                    <When iso={e.at} now={now} />
                    {" · "}
                  </>
                ) : null}
                {sourceText(e.source, inboxName)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {h.production || h.candidate ? (
        <div className="mt-auto flex min-h-11 flex-wrap items-center justify-between gap-x-4 pt-3 sm:h-9 sm:min-h-0 sm:flex-nowrap">
          {h.production ? (
            <span className="inline-flex items-center gap-2 text-[12px] text-fg-2">
              <span aria-hidden className="size-1.5 rounded-full bg-live" />
              Production deploys here
            </span>
          ) : (
            <span className="text-[12px] text-fg-2">Cancel if it no longer serves {repo}</span>
          )}
          {h.candidate && h.billingUrl ? <OutLink href={h.billingUrl}>{`${h.vendor} billing`}</OutLink> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Hostnames inside a sentence: mono, as everywhere else on the page, and never broken at a hyphen. */
function withHosts(text: string) {
  return text.split(/(\b[\w-]+(?:\.[\w-]+)+\b)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="font-mono whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

const shortDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));

/** One status word for the header: a fact about deploys or the repo, with its reason on hover. */
function statusOf(page: ProjectPage): { word: string; dot: string; text: string; why: string } {
  const p = page.project;
  const failed = page.deployments.find((d) => isFailedState(d.state) && d.environment.toLowerCase() === "production");
  if (p.health === "archived") return { ...HEALTH.archived, why: "Archived on GitHub." };
  if (failed || p.health === "failed") return { ...HEALTH.failed, why: "The latest production deploy failed. Source: GitHub." };
  if (p.health === "idle") return { ...HEALTH.idle, why: "No push in 90 days. Source: GitHub." };
  if (p.live) return { word: "live", dot: "bg-live", text: "text-fg-2", why: "A deploy succeeded and is the latest for its environment. Source: GitHub." };
  if (page.deployments.length) return { word: "not live", dot: "bg-fg-3", text: "text-fg-3", why: "No deploy's latest state is a success. Source: GitHub." };
  return { word: "no deploys", dot: "ring-1 ring-inset ring-fg-3", text: "text-fg-3", why: "GitHub reports no deployments for this repo." };
}

/** "receipts in you@example.com" reads shorter with the inbox shortened; the full address stays in the title. */
function sourceText(source: string, inboxName: (a: string) => string) {
  return source.replace(/[\w.+-]+@[\w.-]+\.\w+/g, (a) => inboxName(a));
}

function Evidence({ e, now, inboxName }: { e: EvidenceRow; now: number; inboxName: (a: string) => string }) {
  return (
    <div className="grid gap-x-4 py-1 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-baseline">
      <dt className="text-[12px] text-fg-3">{e.label}</dt>
      <dd className="min-w-0 text-[14px] text-pretty text-fg">
        {e.value}
        <span className="block text-[12px] text-fg-3 sm:inline" title={e.source}>
          <span className="hidden sm:inline">{"  "}</span>
          {e.at ? (
            <>
              <When iso={e.at} now={now} />
              {" · "}
            </>
          ) : null}
          {sourceText(e.source, inboxName)}
        </span>
      </dd>
    </div>
  );
}

function DomainItem({ d, now, inboxName }: { d: DomainRow; now: number; inboxName: (a: string) => string }) {
  const soon = d.renewsAt ? (Date.parse(d.renewsAt) - now) / 86_400_000 : null;
  const amber = soon !== null && soon >= 0 && soon <= 30;
  const seen = d.seenIn.map((s) => (s === "deploy" ? "deploys" : "mail")).join(", ");
  const renews = d.renewsAt ? (
    <time dateTime={d.renewsAt} title={absoluteTime(d.renewsAt)}>
      {dueWords(d.renewsAt, now)}
    </time>
  ) : null;
  const amount = d.renewalCents !== null ? money(d.renewalCents, d.currency) : null;
  const name = (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${d.live ? "bg-live" : "ring-1 ring-inset ring-fg-3"}`} />
      <span className="truncate font-mono text-[14px] text-fg">{d.name}</span>
      <CopyButton value={d.name} label="Copy domain" />
    </span>
  );
  return (
    <li className={`border-b border-line-1 py-2.5 lg:grid lg:min-h-11 lg:items-center ${DOM_COLS}`}>
      <span className="hidden min-w-0 lg:block">{name}</span>
      <span className="hidden text-[14px] text-fg-2 lg:block">{seen}</span>
      <span className="hidden text-[14px] text-fg-2 lg:block">{d.registrar ?? <span className="text-fg-3">unknown</span>}</span>
      <span className={`hidden text-[14px] lg:block ${amber ? "text-amber" : "text-fg-2"}`}>{renews ?? <span className="text-[12px] text-fg-3">no notice yet</span>}</span>
      <span className="hidden truncate text-[14px] text-fg-2 lg:block" title={d.receivedBy ?? undefined}>
        {d.receivedBy ? inboxName(d.receivedBy) : <span className="text-[12px] text-fg-3">no notice yet</span>}
      </span>
      <span className="num hidden text-right font-mono text-[14px] text-fg lg:block">{amount ?? <span className="font-sans text-[12px] text-fg-3">unknown</span>}</span>
      <span className="hidden text-right lg:block">{d.billingUrl ? <OutLink quiet href={d.billingUrl}>Billing</OutLink> : null}</span>

      {/* Narrow: the name and renewal amount, then registrar, date and where it was seen. */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {name}
          {amount ? <span className="num shrink-0 font-mono text-[14px] text-fg">{amount}</span> : null}
        </div>
        <p className="text-[12px] text-fg-3">
          {d.registrar}
          {renews ? (
            <span className={amber ? "text-amber" : undefined}>
              {d.registrar ? " · " : ""}renews {renews}
            </span>
          ) : null}
          {d.registrar || renews ? " · " : ""}
          {seen}
        </p>
        {d.billingUrl ? <OutLink href={d.billingUrl}>{`${d.registrar} billing`}</OutLink> : null}
      </div>
    </li>
  );
}

function ServiceItem({ s, inboxName }: { s: ServiceRow; inboxName: (a: string) => string }) {
  const note = !s.active ? "stopped" : !s.verified ? "sender not verified" : s.scope !== "work" ? (s.scope === "personal" ? "personal, not counted" : "not placed yet") : null;
  const amount = s.monthlyCents !== null ? money(s.monthlyCents, s.currency) : null;
  const cadence = s.cadence === "annual" ? "yearly, spread" : s.cadence === "usage" ? "usage, 3-mo avg" : null;
  const billedElsewhere = s.owner.toLowerCase() !== s.inbox.toLowerCase();
  const shared = s.sharedWith.map((x) => x.split("/").pop()).join(", ");
  const name = (
    <span className="text-[14px] text-fg">
      {s.vendor}
      {s.plan ? <span className="text-fg-2"> {s.plan}</span> : null}
      {note ? <span className="text-[12px] text-amber"> {note}</span> : null}
    </span>
  );
  return (
    <li className={`py-2.5 lg:grid lg:min-h-11 lg:items-center ${SVC_COLS} ${s.counted ? "" : "opacity-70"}`}>
      <span className="hidden lg:block">{name}</span>
      <span className="hidden min-w-0 lg:block" title={s.source}>
        <span className="block truncate text-[14px] text-fg-2">{inboxName(s.inbox)}</span>
        {billedElsewhere ? <span className="block truncate text-[12px] text-fg-3">billed to {inboxName(s.owner)}</span> : null}
      </span>
      <span className="hidden truncate text-[14px] lg:block">
        {s.sharedWith.length ? (
          <span className="font-mono text-fg-2" title={s.sharedWith.join(", ")}>
            {shared}
          </span>
        ) : (
          <span className="text-fg-3">this repo only</span>
        )}
      </span>
      <span className="num hidden text-right font-mono text-[14px] text-fg lg:block">
        {amount ?? <span className="font-sans text-[12px] text-fg-3">unknown</span>}
        {cadence ? <span className="block font-sans text-[12px] text-fg-3">{cadence}</span> : null}
      </span>
      <span className="hidden text-right lg:block">{s.billingUrl ? <OutLink quiet href={s.billingUrl}>Billing</OutLink> : null}</span>

      {/* Narrow: vendor and amount, then where the receipts land and what else it serves, ending in the way out. */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          {name}
          <span className="num shrink-0 font-mono text-[14px] text-fg">{amount ?? <span className="font-sans text-[12px] text-fg-3">unknown</span>}</span>
        </div>
        <p className="text-[12px] text-fg-3" title={s.source}>
          {[`receipts in ${inboxName(s.inbox)}`, billedElsewhere ? `billed to ${inboxName(s.owner)}` : null, shared ? `also serves ${shared}` : null, cadence]
            .filter(Boolean)
            .map((t, i) => (
              <span key={i} className="whitespace-nowrap">
                {i ? " · " : ""}
                {t}{" "}
              </span>
            ))}
        </p>
        {s.billingUrl ? <OutLink href={s.billingUrl}>{`${s.vendor} billing`}</OutLink> : null}
      </div>
    </li>
  );
}
