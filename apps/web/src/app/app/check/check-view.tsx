"use client";
/**
 * The check: five findings per Vercel project. A client of GET /api/v1/checks.
 * `CheckScreen` is pure so the dev preview can render it against fixtures.
 *
 * Projects with something open come first and show every row. Projects with
 * nothing open fold into one line each, so a healthy account reads as a short list.
 */
import Link from "next/link";
import { useState } from "react";
import { Empty, PageHeader, SectionTitle, buttonStyles, surface } from "@/components/ui";
import { apiSend, useApi } from "@/components/use-api";
import { REASON_TEXT } from "@/lib/checks/catalog";
import { prLabel } from "@/lib/checks/handoff";
import { CopyForAgent } from "../copy-for-agent";
import { ago } from "../project-model";
import { CheckMatrix } from "./check-matrix";
import { checkPrompt, findingAnchor } from "./check-prompt";
import { ExpirationsPanel, type ExpirationReport } from "./expirations-panel";

export type Check = {
  id: string | null;
  check: string;
  state: "open" | "ok" | "unknown" | "not_applicable" | (string & {});
  reason: string | null;
  source: string;
  name: string;
  title: string;
  severity?: "exposed" | "gap";
  why: string;
  limit?: string;
  fix: { text: string; steps?: string[]; docUrl: string; settingUrl?: string };
  /** What a coding agent should do: open a pull request, or hand the person exact steps. */
  agent?: { handoff: "pull_request" | "person"; instructions: string; personAfter?: string };
  evidence: Record<string, unknown>;
  firstOpenAt: string | null;
  fixedAt: string | null;
  dismissedAt: string | null;
  checkedAt: string | null;
  handoff?: { attempts: number; max: number; capped: boolean; inProgress: boolean; last: { outcome: string | null; prUrl: string | null; note: string | null; at: string | null } | null };
};
export type CheckProject = { nodeId: string; name: string; repo?: string | null; productionUrl: string | null; checks: Check[] };
export type CheckReport = { ready: boolean; summary: { projects: number; open: number; fixed: number; unknown: number }; projects: CheckProject[] };
type ServicesReport = {
  services: { id: string; name: string; category: string; projects: string[]; sources: string[]; monthlyCostUsd: number | null; costSource: string | null; costNote: string; usage?: { state: "in_use" | "idle" | "unknown"; basis: string }; shared: boolean }[];
  shares?: { category: string; title: string; projects: { project: string; service: string }[] }[];
  bill?: { accounts: BillAccount[]; rule: string };
};
type BillLine = { name: string; usd: number };
type BillAccount = { account: string; from: string; to: string; totalUsd: number; chargedUsd: number | null; projects: { project: string; usd: number; products: BillLine[] }[]; unassigned: { usd: number; products: BillLine[] } };
const dollars = (usd: number) => `$${usd.toFixed(2)}`;
const productLine = (products: BillLine[]) => products.map((l) => `${l.name} ${dollars(l.usd)}`).join(" · ");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** Where the list learned of a service, in the order of how sure that is. */
const foundIn = (sources: string[]) => sources.includes("vercel") ? "Seen in Vercel settings" : sources.includes("vercel_billing") ? "On your Vercel bill" : "Recorded by your agent";
/** The basis, without the leading "In use:" or "Idle:" that the label already says. */
const usageReason = (basis: string) => basis.replace(/^(In use|Idle|Unknown): /, "").replace(/\.$/, "");

const isOpen = (c: Check) => c.state === "open" && !c.dismissedAt;
const reported = (c: Check) => c.source === "reported";
/** The one red state: a secret that is already public. Every other open finding is amber. */
const markOf = (c: Check) => (c.state === "open" && c.severity === "exposed" ? "exposed" : c.state);
/** "Fixed yesterday", in words a person would say. */
/** What the person's own agent did with this finding. Its note is shown as plain text, and only a checked pull request address becomes a link. */
export function handoffWords(h: Check["handoff"], now: number): { text: string; pr?: { href: string; label: string }; after?: string; note?: string } | null {
  if (!h) return null;
  if (h.inProgress) return { text: "Your agent is working on this." };
  if (h.capped) return { text: `${h.max === 3 ? "Three" : h.max} tries used. This one needs you.` };
  const last = h.last;
  if (!last) return null;
  const label = prLabel(last.prUrl);
  if (last.outcome === "pr_opened" && label && last.prUrl) return { text: "Your agent opened", pr: { href: last.prUrl, label }, after: "for you to review and merge." };
  if (last.outcome === "told_person") return { text: `Your agent passed this to you${last.at ? ` ${ago(last.at, now)}` : ""}.` };
  if (last.outcome === "could_not_fix") return { text: "Your agent could not fix this.", note: last.note ?? undefined };
  if (last.outcome === "not_a_problem") return { text: "Your agent thinks this is not a problem.", note: last.note ?? undefined };
  return null;
}

/** Sits after what we found and before what to do, in the ink of an instruction: it changes what the person does next. The note is the agent's own words, so it is quoted. A waiting pull request takes the one primary button, right under the line that names it. */
function HandoffLine({ handoff, now }: { handoff: Check["handoff"]; now: number }) {
  const w = handoffWords(handoff, now);
  if (!w) return null;
  return (
    <div className="mt-4 max-w-[60ch] text-pretty">
      <p className="text-fg">
        {w.text}
        {w.pr ? <> <a href={w.pr.href} target="_blank" rel="noreferrer" className={`${link} font-mono text-[13px] whitespace-nowrap`}>{w.pr.label}</a> {w.after}</> : null}
      </p>
      {w.note ? <p className="mt-1">“{w.note}”</p> : null}
      {w.pr ? (
        <a href={w.pr.href} target="_blank" rel="noreferrer" className={`${buttonStyles.repair} mt-3`}>
          Review pull request
        </a>
      ) : null}
    </div>
  );
}

export function fixedWords(iso: string, now: number): string {
  const days = Math.floor(Math.max(0, now - Date.parse(iso)) / 86_400_000);
  return days === 0 ? "Fixed today" : days === 1 ? "Fixed yesterday" : `Fixed ${days} days ago`;
}
const MARK_LABEL: Record<string, string> = { exposed: "Exposed now", open: "Open finding", ok: "Passes", not_applicable: "Does not apply" };

/** Drawn state mark, 20px. What needs a look is the loudest thing on the row; a pass is the quietest. */
function Mark({ state }: { state: string }) {
  const tone = state === "exposed" ? { stroke: "stroke-red", fill: "fill-red" } : { stroke: "stroke-amber", fill: "fill-amber" };
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" role="img" aria-label={MARK_LABEL[state] ?? "Not checked"}>
      {state === "ok" ? (
        <path d="M5.5 10.4 8.6 13.4 14.5 7" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-fg-3" />
      ) : state === "open" || state === "exposed" ? (
        <>
          <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.25" className={tone.stroke} />
          <path d="M10 5.8v5" strokeWidth="1.6" strokeLinecap="round" className={tone.stroke} />
          <circle cx="10" cy="13.9" r="0.95" className={tone.fill} />
        </>
      ) : state === "not_applicable" ? (
        <path d="M6.5 10h7" strokeWidth="1.5" strokeLinecap="round" className="stroke-fg-3" />
      ) : (
        <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1.25" strokeDasharray="2.6 2.6" className="stroke-fg-3" />
      )}
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0 text-fg-3 transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Names and paths only. The API never carries a secret's value, so there is none to show. */
function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const hits = Array.isArray(evidence.hits)
    ? evidence.hits.flatMap((x) => (x && typeof x === "object" && typeof x.pattern === "string" && typeof x.path === "string" ? [`${x.pattern} in ${x.path}`] : []))
    : [];
  const values = [...(typeof evidence.name === "string" ? [evidence.name] : []), ...strings(evidence.names), ...strings(evidence.paths), ...hits];
  if (!values.length) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Evidence">
      {values.map((v) => (
        <li key={v} className="rounded-md bg-bg-deep px-2 py-1 font-mono text-[12px] leading-[1.5] [overflow-wrap:anywhere] text-fg select-all">
          {v}
        </li>
      ))}
    </ul>
  );
}

/** Why a check has no answer. Links to Connections only when that is where it gets fixed. */
function Reason({ reason }: { reason: string | null }) {
  const known = REASON_TEXT[reason ?? ""];
  return (
    <p className="mt-0.5 text-[12px] text-pretty text-fg-3">
      {known?.text ?? "We could not check this."}
      {known?.connect ? (
        <>
          {" "}
          <Link href="/app/connections" className="underline underline-offset-2 hover:text-fg">
            Open Connections
          </Link>
        </>
      ) : null}
    </p>
  );
}

const link = "underline decoration-line-3 underline-offset-4 hover:decoration-fg";

/** An agent can take it: not already being worked, no pull request waiting, tries left, not judged a non-problem. */
export function canHandOff(c: Check, prWaiting: boolean): boolean {
  const h = c.handoff;
  return Boolean(c.id) && !prWaiting && !h?.inProgress && !h?.capped && h?.last?.outcome !== "not_a_problem";
}

function OpenRow({ c, project, busy, now, onDismiss }: { c: Check; project: CheckProject; busy: boolean; now: number; onDismiss: ((c: Check) => void) | null }) {
  // Once a pull request is waiting, reading it is the next step: it holds the primary button, and the setting becomes a plain link.
  const pr = handoffWords(c.handoff, now)?.pr;
  return (
    <details id={c.id ? findingAnchor(c.id) : undefined} className="group scroll-mt-24" open={markOf(c) === "exposed"}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Mark state={markOf(c)} />
        <span className="min-w-0 flex-1 text-[14px] font-medium text-pretty text-fg">{c.title}</span>
        {markOf(c) === "exposed" ? <span className="shrink-0 text-[12px] font-medium text-red">Exposed</span> : null}
        {reported(c) ? <span className="hidden shrink-0 text-[12px] text-fg-3 sm:block">Reported by your agent</span> : null}
        <Chevron />
      </summary>
      <div className="px-4 pb-5 text-[14px] leading-[1.55] text-fg-2 sm:pr-5 sm:pl-[52px]">
        <p className="max-w-[60ch] text-pretty">{c.why}</p>
        <Evidence evidence={c.evidence} />
        {c.limit ? <p className="mt-3 max-w-[60ch] text-[12px] text-pretty text-fg-3">{c.limit}</p> : null}
        <HandoffLine handoff={c.handoff} now={now} />
        {canHandOff(c, Boolean(pr)) ? <CopyForAgent prompt={checkPrompt(project, c)} className="mt-4" /> : null}
        <p className="mt-4 max-w-[60ch] text-pretty text-fg">{c.fix.text}</p>
        {c.fix.steps ? <pre className="mt-3 overflow-x-auto rounded-lg bg-bg-deep p-3 font-mono text-[12px] leading-[1.6] text-fg select-all">{c.fix.steps.join("\n")}</pre> : null}
        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          {c.fix.settingUrl && !pr ? (
            <a href={c.fix.settingUrl} target="_blank" rel="noreferrer" className={buttonStyles.repair}>
              Open the setting on Vercel
            </a>
          ) : null}
          <div className="flex w-full items-center justify-between gap-x-3 whitespace-nowrap sm:contents">
            {c.fix.settingUrl && pr ? (
              <a href={c.fix.settingUrl} target="_blank" rel="noreferrer" className={`${link} whitespace-nowrap`}>
                Open on Vercel
              </a>
            ) : null}
            <a href={c.fix.docUrl} target="_blank" rel="noreferrer" className={`${link} whitespace-nowrap`}>
              Read the docs
            </a>
            {c.id && onDismiss ? (
              <button type="button" disabled={busy} onClick={() => onDismiss(c)} className={`${buttonStyles.ghost} sm:ml-auto`}>
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-[12px] text-fg-3">
          {reported(c) ? "Reported by your agent" : "Checked"}
          {c.checkedAt ? ` ${ago(c.checkedAt, now)}` : ""}
        </p>
      </div>
    </details>
  );
}

function QuietRow({ c, now }: { c: Check; now: number }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5">
      <Mark state={c.state} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-fg-2">{c.title}</p>
        {c.state !== "ok" ? <Reason reason={c.reason} /> : null}
      </div>
      {c.state === "ok" && c.fixedAt ? <span className="shrink-0 text-[12px] text-fg-2">{fixedWords(c.fixedAt, now)}</span> : null}
    </div>
  );
}

function Rows({ project, busy, now, onDismiss }: { project: CheckProject; busy: string | null; now: number; onDismiss: ((c: Check) => void) | null }) {
  const checks = project.checks;
  // Open first; the order inside each group is the catalog's, most serious first.
  const live = checks.filter((c) => !c.dismissedAt);
  const ordered = [...live.filter(isOpen), ...live.filter((c) => !isOpen(c))];
  return (
    <div className="divide-y divide-line-1">
      {ordered.map((c) => (isOpen(c) ? <OpenRow key={c.check} c={c} project={project} busy={busy === c.id} now={now} onDismiss={onDismiss} /> : <QuietRow key={c.check} c={c} now={now} />))}
    </div>
  );
}

/** "4 pass, 1 not checked". Checks that do not apply are left out of the count. */
export function quietSummary(checks: Check[]): string {
  const live = checks.filter((c) => !c.dismissedAt);
  const pass = live.filter((c) => c.state === "ok").length;
  const unknown = live.filter((c) => c.state === "unknown").length;
  const parts = [pass ? `${pass} pass` : null, unknown ? `${unknown} not checked` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "Nothing applies";
}

export function checkLede(report: CheckReport | null): string {
  if (!report?.ready || !report.summary.projects) return "Five checks for every Vercel project.";
  const { open, projects, fixed } = report.summary;
  const across = `across ${projects} ${projects === 1 ? "project" : "projects"}`;
  const head = open ? `${open} open ${across}.` : `Nothing open ${across}.`;
  return fixed ? `${head} ${fixed} fixed.` : head;
}

export function CheckScreen({
  report,
  error,
  now,
  actionError = null,
  busy = null,
  onDismiss = null,
  onRestore = null,
}: {
  report: CheckReport | null;
  error: string | null;
  now: number;
  actionError?: string | null;
  busy?: string | null;
  onDismiss?: ((c: Check) => void) | null;
  onRestore?: ((c: Check) => void) | null;
}) {
  const projects = report?.ready ? report.projects : [];
  const needsLook = projects.filter((p) => p.checks.some(isOpen));
  const quiet = projects.filter((p) => !p.checks.some(isOpen));
  // "All clear" is a claim. A project earns it only when nothing is left unchecked.
  const unchecked = (p: CheckProject) => p.checks.some((c) => !c.dismissedAt && c.state === "unknown");
  const quietGroups = [
    { id: "check-partial", title: "Not fully checked", list: quiet.filter(unchecked) },
    { id: "check-clear", title: "All clear", list: quiet.filter((p) => !unchecked(p)) },
  ].filter((g) => g.list.length);
  const dismissed = projects.flatMap((p) => p.checks.filter((c) => c.dismissedAt).map((c) => ({ c, project: p.name })));

  return (
    <>
      <PageHeader title="Check" lede={checkLede(report)} />
      {error ? (
        <p role="alert" className="mb-5 text-[14px] text-red">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-5 text-[14px] text-red">
          {actionError}
        </p>
      ) : null}
      {!report && !error ? <p className="text-[14px] text-fg-3">Loading…</p> : null}
      {report && !report.ready ? <Empty title="The check turns on with the next update.">Nothing is needed from you.</Empty> : null}
      {report?.ready && !projects.length ? (
        <Empty
          title="Connect Vercel to run the check"
          action={
            <Link href="/app/connections?vercel=open#vercel" className={buttonStyles.primary}>
              Connect Vercel
            </Link>
          }
        >
          Five checks run on every project, read-only. Each finding names the one setting that fixes it.
        </Empty>
      ) : null}

      {projects.length ? <CheckMatrix report={report!} /> : null}

      {needsLook.length ? (
        <div className="space-y-10">
          {needsLook.map((p) => {
            const open = p.checks.filter(isOpen).length;
            return (
              <section key={p.nodeId} id={`check-p-${p.nodeId}`} aria-label={p.name} className="scroll-mt-24">
                <SectionTitle count={`${open} open`}>
                  <span className="font-mono text-[16px] [overflow-wrap:anywhere]">{p.name}</span>
                </SectionTitle>
                <div className={`overflow-hidden ${surface}`}>
                  <Rows project={p} busy={busy} now={now} onDismiss={onDismiss} />
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {quietGroups.map((g, gi) => (
        <section key={g.id} className={needsLook.length || gi ? "mt-12" : ""} aria-labelledby={g.id}>
          <SectionTitle id={g.id} count={g.list.length}>
            {g.title}
          </SectionTitle>
          <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
            {g.list.map((p) => (
              <details key={p.nodeId} id={`check-p-${p.nodeId}`} className="group scroll-mt-24">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-fg">{p.name}</span>
                  <span className="num shrink-0 text-[12px] text-fg-2">{quietSummary(p.checks)}</span>
                  <Chevron />
                </summary>
                <div className="border-t border-line-1 bg-bg/40">
                  <Rows project={p} busy={busy} now={now} onDismiss={onDismiss} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      {dismissed.length ? (
        <section className="mt-12" aria-labelledby="check-dismissed">
          <SectionTitle id="check-dismissed" count={dismissed.length}>
            Dismissed
          </SectionTitle>
          <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
            {dismissed.map(({ c, project }) => (
              <div key={`${project}:${c.check}`} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2 sm:flex-nowrap sm:px-5">
                <span className="w-full truncate font-mono text-[14px] text-fg sm:w-44 sm:shrink-0">{project}</span>
                <p className="min-w-0 flex-1 text-[14px] text-pretty text-fg-2">{c.title}</p>
                {c.id && onRestore ? (
                  <button type="button" disabled={busy === c.id} onClick={() => onRestore(c)} className={buttonStyles.ghost}>
                    Restore
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function CheckView() {
  const report = useApi<CheckReport>("/api/v1/checks");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Fixed at mount so server and client render the same words.
  const [now] = useState(() => Date.now());

  async function change(c: Check, restore: boolean) {
    if (!c.id) return;
    setBusy(c.id);
    const result = await apiSend(restore ? "DELETE" : "POST", `/api/v1/checks/${c.id}/dismiss`);
    setBusy(null);
    if (result.ok) {
      setActionError(null);
      await report.reload();
    } else setActionError(result.error ?? "Could not update this finding.");
  }

  return (
    <div className="max-w-4xl">
      <CheckScreen report={report.data} error={report.error} now={now} actionError={actionError} busy={busy} onDismiss={(c) => void change(c, false)} onRestore={(c) => void change(c, true)} />
    </div>
  );
}

/** Parked side feature: reachable at /app/services, not in the nav. */
export function ServicesView() {
  const services = useApi<ServicesReport>("/api/v1/services");
  return (
    <div className="max-w-4xl">
      <PageHeader title="Services" lede="Outside services your projects use, and what they cost." />
      <ServicesSection services={services.data} servicesError={services.error} />
    </div>
  );
}

/** Parked side feature: reachable at /app/expirations, not in the nav. */
export function ExpirationsView() {
  const expirationReport = useApi<ExpirationReport>("/api/v1/expirations");
  return (
    <div className="max-w-4xl">
      <ExpirationsPanel report={expirationReport.data} error={expirationReport.error} reload={expirationReport.reload} />
    </div>
  );
}

export function ServicesSection({ services, servicesError }: { services: ServicesReport | null; servicesError: string | null }) {
  return (
    <>
      <section aria-labelledby="check-services">
        <SectionTitle id="check-services" count={services?.services.length}>Services</SectionTitle>
        <p className="mb-3 text-[13px] text-fg-3">Outside services seen in Vercel settings, on your Vercel bill, or recorded by your agent. In use means a project using it had a production deploy or requests in the last 30 days.</p>
        {servicesError ? <p role="alert" className="text-[13px] text-red">{servicesError}</p> : null}
        {!services && !servicesError ? <p className="text-[13px] text-fg-3">Loading…</p> : null}
        {services && !services.services.length ? <Empty title="No services yet">Connect Vercel or ask your agent to record a service.</Empty> : null}
        {services?.shares?.length ? <div className="mb-3 space-y-2">
          {services.shares.map((share) => <div key={share.category} className={`px-4 py-3 sm:px-5 ${surface}`}>
            <p className="text-[14px] text-fg">{share.title}</p>
            <p className="mt-0.5 font-mono text-[12px] text-fg-2">{share.projects.map((p) => `${p.project} (${p.service})`).join(", ")}</p>
            <p className="mt-1 text-[12px] text-fg-3">A suggestion. Spooky changes nothing.</p>
          </div>)}
        </div> : null}
        {services?.services.length ? <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
          {services.services.map((service) => <div key={service.id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <div className="min-w-32 flex-1"><p className="text-[14px] font-medium text-fg">{service.name}</p><p className="text-[12px] text-fg-3">{service.category} · {foundIn(service.sources)}</p></div>
              <p className="order-last w-full min-w-0 font-mono text-[12px] break-words text-fg-2 sm:order-none sm:w-auto sm:flex-[2]">{service.projects.join(", ")}</p>
              {service.usage ? <span className={`text-[12px] ${service.usage.state === "idle" ? "text-fg" : "text-fg-2"}`}>{service.usage.state === "idle" ? "Idle" : service.usage.state === "unknown" ? "Use unknown" : "In use"}</span> : null}
              <span className="text-right sm:w-24" title={service.costNote}>{service.monthlyCostUsd !== null ? <span className="num text-[12px] text-fg">${service.monthlyCostUsd.toFixed(2)}/mo</span> : <span className="text-[12px] text-fg-3">Cost unknown</span>}</span>
            </div>
            <p className="mt-1 text-[12px] text-pretty text-fg-3">
              {service.usage ? usageReason(service.usage.basis) : null}
              {service.usage ? " · " : null}{service.monthlyCostUsd !== null ? service.costNote : service.costNote.replace(/^Unknown\. /, "Cost: ")}
            </p>
          </div>)}
        </div> : null}
        {services?.bill?.accounts.map((a) => <div key={a.account} className="mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <p className="text-[13px] text-fg-2">Vercel cost, {a.account}, {shortDate(a.from)} to {shortDate(a.to)}</p>
            <p className="num font-mono text-[13px] text-fg">{dollars(a.totalUsd)}</p>
          </div>
          {a.chargedUsd !== null ? <p className="-mt-1 mb-2 text-[12px] text-fg-3">{dollars(a.chargedUsd)} billed beyond your plan. The rest is the plan fee and usage it covers.</p> : null}
          <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
            {[...a.projects.map((p) => ({ key: p.project, label: p.project, mono: true, usd: p.usd, products: p.products })),
              ...(a.unassigned.usd || a.unassigned.products.length ? [{ key: "no-project", label: "Not tied to a listed project", mono: false, usd: a.unassigned.usd, products: a.unassigned.products }] : [])].map((row) => (
              <div key={row.key} className="px-4 py-2.5 sm:px-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className={`min-w-0 break-words text-[14px] text-fg ${row.mono ? "font-mono" : ""}`}>{row.label}</span>
                  <span className="num font-mono text-[12px] text-fg">{dollars(row.usd)}</span>
                </div>
                {row.products.length ? <p className="mt-0.5 text-[12px] text-pretty text-fg-3">{productLine(row.products)}</p> : null}
              </div>
            ))}
          </div>
        </div>)}
      </section>
    </>
  );
}
