"use client";
/**
 * Projects: for each thing you built, where it runs, whether it's live, what it costs and
 * when you last touched it. One dense row per repo, attention first, idle and archived
 * folded. A row opens to the full record, every fact with its source. No chart.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Chevron, Chips, Empty, ErrorLine } from "@/components/ui";
import { formatCents, useApi } from "@/components/use-api";
import { touch } from "@/lib/analytics/client";
import { countLabel, isRunning, type Connection } from "./connection-model";
import { absoluteTime, plural } from "./data-model";
import {
  HEALTH,
  HEALTH_ORDER,
  NOTICE_LABEL,
  ago,
  daysSince,
  deployWord,
  healthReason,
  host,
  inboxNamer,
  isFailedState,
  noticeSentence,
  noticeTone,
  orderDeployments,
  type Deployment,
  type Health,
  type Notice,
  type Project,
  type ProjectsReport,
  siteConfirmedDown,
} from "./project-model";

export function ProjectsView() {
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync)) ? 5000 : null),
  });
  const report = useApi<ProjectsReport>("/api/v1/projects");
  const { reload } = report;

  // While a sync runs, connections poll and the table refills on the same beat.
  useEffect(() => {
    if (conns.data) void reload();
  }, [conns.data, reload]);

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [report.data]);

  return (
    <ProjectsScreen
      ready={Boolean(conns.data) && Boolean(report.data) && now !== null}
      connections={conns.data?.connections ?? []}
      report={report.data}
      error={conns.error ?? report.error}
      now={now ?? 0}
    />
  );
}

type Filter = "all" | "failing" | "alerts" | "idlePaid" | "elsewhere";

const IDLE_DAYS = 90;
const quiet = (h: Health) => h === "idle" || h === "archived";
const TONE_TEXT = { red: "text-red", amber: "text-amber" } as const;

/** Idle 90+ days (or archived) and still billed: the drift worth money. */
export const idlePaid = (p: Project, now: number) =>
  (p.monthlyCents ?? 0) > 0 && (p.health === "archived" || p.health === "idle" || (p.lastPushAt !== null && daysSince(p.lastPushAt, now) >= IDLE_DAYS));

/** Things that want a look: open findings plus red or amber notices in the last 30 days. */
function alertsOf(p: Project, now: number): { count: number; tone: "red" | "amber" | null; words: string[]; first: string | null } {
  // Deploy state already shows in the Live column; alerts are what Live can't show.
  const recent = p.notices.filter((n) => n.verified && n.kind !== "deployment" && n.at && now - Date.parse(n.at) <= 30 * 86_400_000);
  const toned = recent
    .map((n) => ({ n, t: noticeTone(n, now) }))
    .filter((x) => x.t)
    .sort((a, b) => (a.t === "red" ? 0 : 1) - (b.t === "red" ? 0 : 1));
  const words = [...toned.map(({ n }) => noticeText(n, now)), ...p.openFindings.map((f) => f.title)];
  const tone = toned.some((x) => x.t === "red") ? "red" : toned.length || p.openFindings.length ? "amber" : null;
  // The worst alert in one or two words: the kind of notice, else the finding's kind.
  const first = toned[0]
    ? NOTICE_LABEL[toned[0].n.kind].toLowerCase()
    : p.openFindings[0] ? FINDING_WORD[p.openFindings[0].kind] ?? "finding" : null;
  return { count: p.openFindings.length + toned.length, tone, words, first };
}

const FINDING_WORD: Record<string, string> = {
  zombie: "idle, still paid",
  duplicate_plan: "paid twice",
  wrong_tier: "wrong plan",
  expiring: "expiring",
  expired_card: "card declined",
  orphaned_key: "orphaned key",
};

/** The deploy that answers "is it live": production first, then any with a URL. */
function liveDeploy(p: Project): Deployment | null {
  const deps = orderDeployments(p.deployments);
  return deps.find((d) => d.environment.toLowerCase() === "production") ?? deps.find((d) => d.url) ?? deps[0] ?? null;
}

const liveDot = (d: Deployment | null) =>
  !d ? "ring-1 ring-inset ring-fg-3" : isFailedState(d.state) ? "bg-red" : d.state === "success" ? "bg-live" : d.state === "in_progress" || d.state === "queued" || d.state === "pending" ? "bg-fg-2 ring-2 ring-fg-2/30" : "bg-fg-3";

const COLS = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_100px_80px_96px_148px_20px] lg:gap-x-5";

/** Projects, presentational: the dev preview renders it against fixtures. */
export function ProjectsScreen({
  ready,
  connections,
  report,
  error,
  now,
}: {
  ready: boolean;
  connections: Connection[];
  report: ProjectsReport | null;
  error: string | null;
  now: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showQuiet, setShowQuiet] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // "/" jumps to the filter box, the way every dev tool does it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const projects = useMemo(() => {
    const rank = (h: Health) => HEALTH_ORDER.indexOf(h);
    return [...(report?.projects ?? [])].sort((a, b) => rank(a.health) - rank(b.health) || (b.lastPushAt ?? "").localeCompare(a.lastPushAt ?? ""));
  }, [report]);
  const inboxName = useMemo(
    () =>
      inboxNamer([
        ...connections.filter((c) => c.provider === "gmail").map((c) => c.display),
        ...projects.flatMap((p) => [...p.subscriptions.map((s) => s.inbox), ...p.notices.map((n) => n.inbox)]),
      ]),
    [connections, projects],
  );

  const test: Record<Filter, (p: Project) => boolean> = {
    all: () => true,
    failing: (p) => p.health === "failed",
    alerts: (p) => alertsOf(p, now).count > 0,
    idlePaid: (p) => idlePaid(p, now),
    elsewhere: (p) => Boolean(p.elsewhere),
  };
  const count = (f: Filter) => projects.filter(test[f]).length;
  const q = query.trim().toLowerCase();
  const matches = projects.filter((p) => test[filter](p) && (!q || p.name.toLowerCase().includes(q)));
  const hideQuiet = filter === "all" && !q && !showQuiet && matches.some((p) => !quiet(p.health));
  const rows = hideQuiet ? matches.filter((p) => !quiet(p.health)) : matches;
  const idle = matches.filter((p) => p.health === "idle").length;
  const archived = matches.filter((p) => p.health === "archived").length;
  const hidden = matches.length - rows.length;

  const accounts = connections.filter((c) => c.provider === "github" && c.status !== "revoked").length;
  const inboxes = connections.filter((c) => c.provider === "gmail" && c.status !== "revoked").length;
  const syncing = connections.some((c) => isRunning(c.sync));
  const last = connections.map((c) => c.lastSyncedAt).filter((x): x is string => Boolean(x)).sort().at(-1);
  const sumOf = (list: Project[]) => list.reduce((a, p) => a + (p.currency === null || p.currency === report?.totals.currency ? (p.monthlyCents ?? 0) : 0), 0);
  const billed = sumOf(projects);
  const shownBilled = sumOf(matches);
  const rest = Math.max(0, (report?.totals.monthlyCents ?? 0) - billed);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg">Projects</h1>
          {projects.length ? (
            <span className="inline-flex items-center text-[14px] text-fg-2">
              Copy as JSON
              <CopyButton value={JSON.stringify(report, null, 2)} label="Copy projects as JSON" />
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-[66ch] text-[16px] leading-[1.5] text-pretty text-fg-2">
          Where each thing you built runs, whether it&apos;s live, what it costs, and when you last touched it.
        </p>
        {report && projects.length ? (
          <p className="mt-2 max-w-[80ch] text-[14px] text-pretty text-fg-3">
            {plural(projects.filter((p) => p.kind !== "host").length, "repo", "repos")} from {countLabel("github", accounts)}
            {projects.some((p) => p.kind === "host") ? ` and ${plural(projects.filter((p) => p.kind === "host").length, "Vercel project", "Vercel projects")}` : ""}
            {inboxes ? `, costs from receipts in ${countLabel("gmail", inboxes)}` : ""}.{" "}
            {last ? <span title={absoluteTime(last)}>{syncing ? "Syncing now; last finished" : "Synced"} {ago(last, now)}.</span> : syncing ? "Syncing now." : null}
            {rest > 0 ? (
              <>
                {" "}
                <span className="num font-mono">{formatCents(rest)}</span>/mo of work bills names no project; it&apos;s on{" "}
                <Link href="/app/findings" className="text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
                  Spend
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {error ? <ErrorLine message={error} /> : null}
      {!ready && !error ? <p className="text-[16px] text-fg-2">Loading your projects.</p> : null}

      {ready && !projects.length ? (
        <Empty
          title="No repos yet"
          action={
            <Link href="/app" className="text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
              Finish setup on Today
            </Link>
          }
        >
          Projects come from GitHub. Install the GitHub app on every account you deploy from, and each repo shows up here with its
          deploys and what it costs.
        </Empty>
      ) : null}

      {projects.length ? (
        <section aria-label="Projects" className="mb-16">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Chips<Filter>
              wrap
              label="Filter projects"
              value={filter}
              onChange={(k) => {
                setFilter(k);
                setShowQuiet(false);
              }}
              options={[
                { key: "all", label: "All", count: projects.length },
                ...(count("failing") ? [{ key: "failing" as const, label: "Failing", count: count("failing"), tone: "red" as const }] : []),
                ...(count("alerts") ? [{ key: "alerts" as const, label: "Has alerts", count: count("alerts"), tone: "amber" as const }] : []),
                ...(count("elsewhere") ? [{ key: "elsewhere" as const, label: "Not on Vercel", count: count("elsewhere") }] : []),
                { key: "idlePaid", label: `Idle ${IDLE_DAYS}+ days, still paid`, count: count("idlePaid") },
              ]}
            />
            <label className="relative block sm:w-56">
              <span className="sr-only">Filter projects by name</span>
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") (setQuery(""), e.currentTarget.blur());
                  // Enter opens the first match, so a name and Enter is the whole trip.
                  if (e.key === "Enter" && rows[0]) {
                    e.preventDefault();
                    router.push(projectHref(rows[0].name));
                  }
                }}
                placeholder="Filter by name"
                aria-describedby="project-filter-hint"
                className="h-11 w-full rounded-lg border border-line-2 bg-transparent pr-9 pl-3 font-mono text-[14px] text-fg placeholder:font-sans placeholder:text-fg-3 hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-8"
              />
              <span id="project-filter-hint" className="sr-only">
                Enter opens the first match.
              </span>
              <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line-2 px-1.5 font-mono text-[12px] leading-[18px] text-fg-3 sm:block">
                /
              </kbd>
            </label>
          </div>

          <div className="border-t border-line-2">
            <div aria-hidden className={`hidden border-b border-line-1 py-2 text-[12px] text-fg-3 lg:grid ${COLS}`}>
              <span>Project</span>
              <span>Live</span>
              <span>Host</span>
              <span>Last push</span>
              <span className="text-right">Cost / mo</span>
              <span>Alerts</span>
              <span />
            </div>
            {rows.length ? (
              <ul>
                {rows.map((p) => (
                  <ProjectRow key={p.id} p={p} now={now} open={open.has(p.id)} onToggle={() => toggle(p.id)} inboxName={inboxName} showMove={filter === "elsewhere"} />
                ))}
              </ul>
            ) : (
              <p className="py-8 text-[14px] text-fg-2">
                {q ? (
                  <>
                    No project matches <span className="font-mono text-fg">{query.trim()}</span>.
                  </>
                ) : filter === "idlePaid" ? (
                  "Nothing idle is still being paid for. Good."
                ) : (
                  "Nothing in this filter."
                )}
              </p>
            )}
            {shownBilled > 0 ? (
              <div className={`flex items-baseline justify-between gap-4 border-b border-line-1 py-2.5 lg:grid ${COLS}`}>
                <span className="text-[12px] text-fg-3 lg:col-span-4">
                  Total for {matches.length === projects.length ? "all" : "these"} {plural(matches.length, "project", "projects")}
                  {hidden > 0 ? ", folded ones too" : ""}, from receipts in {countLabel("gmail", inboxes)}
                </span>
                <span className="num text-right font-mono text-[14px] text-fg">{formatCents(shownBilled)}</span>
                <span className="hidden lg:col-span-2 lg:block" />
              </div>
            ) : null}
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShowQuiet(true)}
                className="flex min-h-11 w-full items-center gap-2 border-b border-line-1 text-left text-[14px] text-fg-2 transition-colors hover:text-fg sm:min-h-10"
              >
                <Chevron open={false} />
                Show {[idle ? `${idle} idle` : null, archived ? `${archived} archived` : null].filter(Boolean).join(" and ")}
              </button>
            ) : null}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-fg-3">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-live" /> live
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-red" /> latest deploy failed
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-fg-2 ring-2 ring-fg-2/30" /> deploying
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-fg-3" /> inactive
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full ring-1 ring-inset ring-fg-3" /> no deploys reported
            </span>
            <span>Deploy states from GitHub; hosts read from the deploy URL.</span>
          </p>
        </section>
      ) : null}
    </>
  );
}

/** The project page for a repo: /app/projects/owner/repo. */
export const projectHref = (name: string) => `/app/projects/${name.split("/").map(encodeURIComponent).join("/")}`;

function RepoName({ name, className = "" }: { name: string; className?: string }) {
  const i = name.indexOf("/");
  return (
    <span className={`truncate font-mono ${className}`} title={name}>
      {i > 0 ? <span className="text-fg-3">{name.slice(0, i + 1)}</span> : null}
      <span className="text-fg">{i > 0 ? name.slice(i + 1) : name}</span>
    </span>
  );
}

/** Ignore row clicks that land on a control inside it. */
const fromControl = (e: MouseEvent) => Boolean((e.target as HTMLElement).closest("a, button, input"));

function ProjectRow({
  p,
  now,
  open,
  onToggle,
  inboxName,
  showMove,
}: {
  p: Project;
  now: number;
  open: boolean;
  onToggle: () => void;
  inboxName: (a: string) => string;
  /** The move link shows only in the "Not on Vercel" view, so rows in every other view keep one height. */
  showMove: boolean;
}) {
  const deps = orderDeployments(p.deployments);
  const live = liveDeploy(p);
  const mailFail = !deps.length ? (p.notices.find((n) => n.kind === "deployment" && noticeTone(n, now) === "red") ?? null) : null;
  const reason = healthReason(p, now);
  const panelId = `project-${p.id}`;
  const alerts = alertsOf(p, now);
  const billers = [...new Set(p.subscriptions.map((s) => s.vendor))].join(", ");
  const failed = live ? isFailedState(live.state) : false;
  const hostName = live ? (live.provider ?? (live.url ? "Custom domain" : null)) : mailFail ? mailFail.vendor : null;

  const liveCell = live ? (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${liveDot(live)}`} />
      {siteConfirmedDown(p) ? <span className="shrink-0 text-[12px] text-red">site down</span> : null}
      {live.url ? <span className="truncate font-mono text-[14px] text-fg">{host(p.productionUrl ?? live.url)}</span> : null}
      {!live.url ? <span className="truncate text-[14px] text-fg-2">{live.environment}</span> : null}
      <span
        className={`shrink-0 text-[12px] ${failed ? "text-red" : "text-fg-3"}`}
        title={live.at ? `${absoluteTime(live.at)}. Source: GitHub deployments` : "Source: GitHub deployments"}
      >
        {failed ? `${live.environment} failed` : live.state === "success" ? "" : deployWord(live.state)}
        {live.at ? `${failed || live.state !== "success" ? " " : ""}${ago(live.at, now)}` : ""}
      </span>
    </span>
  ) : mailFail ? (
    <span className="flex min-w-0 items-center gap-2" title={`Source: mail from ${mailFail.inbox}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-red" />
      <span className="truncate text-[14px] text-red">deploy failed</span>
      {mailFail.at ? <span className="shrink-0 text-[12px] text-fg-3">{ago(mailFail.at, now)}</span> : null}
    </span>
  ) : (
    <span className="flex items-center gap-2 text-[14px] text-fg-3">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${liveDot(null)}`} />
      No deploys
    </span>
  );

  const push = p.lastPushAt ? (
    <span title={`${absoluteTime(p.lastPushAt)}. Source: ${p.kind === "host" ? (p.host ?? "host") : "GitHub"}`}>{ago(p.lastPushAt, now)}</span>
  ) : (
    <span className="text-fg-3">never</span>
  );

  return (
    <li className={`group border-b border-line-1 ${quiet(p.health) ? "text-fg-2" : ""}`}>
      <div
        className={`cursor-default py-2.5 transition-colors duration-150 hover:bg-raised lg:grid lg:min-h-12 lg:items-center ${COLS}`}
        onClick={(e) => {
          if (!fromControl(e)) onToggle();
        }}
      >
        {/* Wide: one row, the table's columns. */}
        <div className="hidden min-w-0 lg:block">
          <div className="flex min-w-0 items-center gap-1">
            <Link href={projectHref(p.name)} className="flex min-w-0 underline-offset-4 decoration-line-3 hover:underline">
              <RepoName name={p.name} className={`text-[14px] ${p.health === "archived" ? "opacity-60" : ""}`} />
            </Link>
            <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <CopyButton value={p.name} label="Copy repo name" />
            </span>
          </div>
          {showMove && p.elsewhere ? <MoveLink move={p.elsewhere} /> : null}
        </div>
        <div className="hidden min-w-0 lg:block">{liveCell}</div>
        <div className="hidden truncate text-[14px] text-fg-2 lg:block" title={hostName === "Custom domain" ? "Custom domain: the host shows once the provider account is connected" : undefined}>
          {hostName === "Custom domain" ? <span className="text-[12px] text-fg-3">unknown</span> : (hostName ?? <span className="text-[12px] text-fg-3">none</span>)}
        </div>
        <div className="num hidden text-[14px] text-fg-2 lg:block">{push}</div>
        <div className="hidden text-right lg:block">
          {p.monthlyCents !== null ? (
            <span className="num font-mono text-[14px] text-fg" title={`${billers}. Source: receipts in ${[...new Set(p.subscriptions.map((s) => s.inbox))].join(", ")}`}>
              {formatCents(p.monthlyCents)}
            </span>
          ) : (
            <span className="text-[12px] text-fg-3" title="You have receipts, but none of them names this project. Vendors bill the account, not the app.">
              no bill names it
            </span>
          )}
        </div>
        <div className="hidden min-w-0 lg:block">
          {alerts.count ? (
            <span className={`block truncate text-[14px] ${alerts.tone ? TONE_TEXT[alerts.tone] : "text-fg"}`} title={alerts.words.join("\n")}>
              {alerts.first}
              {alerts.count > 1 ? <span className="num font-mono text-[12px] text-fg-3"> +{alerts.count - 1}</span> : null}
            </span>
          ) : (
            <span className="sr-only">No alerts</span>
          )}
        </div>
        <div className="hidden lg:flex lg:justify-end">
          <ExpandButton open={open} onToggle={onToggle} panelId={panelId} name={p.name} />
        </div>

        {/* Narrow: name and cost, then live, then host, push and alerts. */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3">
            <Link href={projectHref(p.name)} className="flex min-h-11 min-w-0 flex-1 items-center">
              <RepoName name={p.name} className="min-w-0 text-[14px]" />
            </Link>
            {p.monthlyCents !== null ? (
              <span className="num shrink-0 font-mono text-[14px] text-fg">
                {formatCents(p.monthlyCents)}
                <span className="text-[12px] text-fg-3">/mo</span>
              </span>
            ) : null}
            <ExpandButton open={open} onToggle={onToggle} panelId={panelId} name={p.name} />
          </div>
          <div className="mt-0.5">{liveCell}</div>
          <p className="mt-0.5 truncate text-[12px] text-fg-3">
            {[hostName, p.lastPushAt ? `${p.kind === "host" ? "deployed" : "pushed"} ${ago(p.lastPushAt, now)}` : p.kind === "host" ? "no deploys" : "no pushes"].filter(Boolean).join(" · ")}
            {alerts.count ? (
              <span className={alerts.tone ? TONE_TEXT[alerts.tone] : undefined}>
                {" · "}
                {alerts.first}
                {alerts.count > 1 ? ` +${alerts.count - 1} more` : ""}
              </span>
            ) : null}
          </p>
          {showMove && p.elsewhere ? <MoveLink move={p.elsewhere} /> : null}
        </div>
      </div>

      {open ? <ProjectDetail id={panelId} p={p} deps={deps} reason={reason} now={now} inboxName={inboxName} /> : null}
    </li>
  );
}

function MoveLink({ move }: { move: NonNullable<Project["elsewhere"]> }) {
  return <a href={move.importUrl} target="_blank" rel="noreferrer" onClick={() => touch("move_to_vercel_clicked", { from: move.host })} className="inline-flex min-h-8 items-center text-[12px] text-fg-3 underline-offset-4 hover:text-fg hover:underline focus-visible:underline">Move to Vercel</a>;
}

function ExpandButton({ open, onToggle, panelId, name }: { open: boolean; onToggle: () => void; panelId: string; name: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${open ? "Hide" : "Show"} details for ${name}`}
      onClick={onToggle}
      className="relative -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-raised-2 hover:text-fg"
    >
      <Chevron open={open} />
    </button>
  );
}

/** A notice as plain text, for a one-line cell. */
function noticeText(n: Notice, now: number): string {
  const s = noticeSentence(n, now);
  return `${s.vendor ? `${s.vendor}: ` : ""}${s.text}${s.amount ? `, ${s.amount}` : ""}${s.detail ? `, ${s.detail}` : ""}`;
}

/** Kind label, tinted by severity: the one place a notice carries color. */
function KindTag({ n, now }: { n: Notice; now: number }) {
  const tone = n.verified ? noticeTone(n, now) : null;
  return <span className={tone ? TONE_TEXT[tone] : undefined}>{NOTICE_LABEL[n.kind]}</span>;
}

/** One labeled line of the expanded row: a 112px label, then the facts. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-b border-line-1 py-3 last:border-b-0 sm:grid-cols-[112px_minmax(0,1fr)]">
      <h3 className="text-[14px] text-fg-2">{label}</h3>
      <ul className="flex min-w-0 flex-col gap-2">{children}</ul>
    </div>
  );
}

function ProjectDetail({
  id,
  p,
  deps,
  reason,
  now,
  inboxName,
}: {
  id: string;
  p: Project;
  deps: Project["deployments"];
  reason: string | null;
  now: number;
  inboxName: (a: string) => string;
}) {
  return (
    <div id={id} className="border-t border-line-1 bg-raised px-4 pt-1 pb-3 sm:px-6">
      {reason ? (
        <Field label="Why">
          <li className="text-[14px] text-fg">
            {/^(The latest|Archived|No push|GitHub returned)/.test(reason) ? null : <span className={HEALTH[p.health].text}>{HEALTH[p.health].word}. </span>}
            {reason}
          </li>
        </Field>
      ) : null}

      <Field label="Repository">
        <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-0.5">
            <RepoName name={p.name} className="text-[14px]" />
            <CopyButton value={p.name} label="Copy repo name" />
          </span>
          <span className="text-[14px] text-fg-2">
            {[p.private === null ? null : p.private ? "private" : "public", p.defaultBranch ? `branch ${p.defaultBranch}` : null, p.lastPushAt ? `${p.kind === "host" ? "last deploy" : "last push"} ${ago(p.lastPushAt, now)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <Link href={projectHref(p.name)} className="text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
            Open project
          </Link>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noreferrer" className="text-[14px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg">
              Open on GitHub
            </a>
          ) : null}
          <span className="text-[12px] text-fg-3">Source: GitHub</span>
        </li>
      </Field>

      {deps.length ? (
        <Field label="Deploys">
          {deps.map((d, i) => (
            <li key={`${d.environment}-${i}`} className="grid grid-cols-[minmax(0,96px)_80px_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[112px_80px_minmax(0,1fr)_auto]">
              <span className="truncate text-[14px] text-fg-2">{d.environment}</span>
              <span className={`text-[14px] ${isFailedState(d.state) ? "text-red" : "text-fg-2"}`}>{deployWord(d.state)}</span>
              {d.url ? (
                <span className="flex min-w-0 items-center gap-0.5">
                  <a href={d.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[14px] text-fg hover:underline">
                    {host(d.url)}
                  </a>
                  <CopyButton value={d.url} label="Copy deploy URL" />
                </span>
              ) : (
                <span className="text-[14px] text-fg-3">No URL reported</span>
              )}
              <span className="col-span-3 text-[12px] whitespace-nowrap text-fg-3 sm:col-span-1" title={d.at ? absoluteTime(d.at) : undefined}>
                {d.at ? ago(d.at, now) : ""} · {d.provider ? `${d.provider}, via GitHub` : "GitHub"}
              </span>
            </li>
          ))}
        </Field>
      ) : null}

      {p.subscriptions.length ? (
        <Field label="Billed by">
          {p.subscriptions.map((s) => (
            <li key={s.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span className="text-[14px] text-fg">
                {s.vendor}
                {s.plan ? <span className="text-fg-2"> {s.plan}</span> : null}
              </span>
              <span className="num font-mono text-[14px] text-fg">
                {s.monthlyCents !== null ? (
                  <>
                    {formatCents(s.monthlyCents)}
                    <span className="text-[12px] text-fg-3">/mo</span>
                  </>
                ) : (
                  <span className="font-sans text-fg-3">amount unknown</span>
                )}
              </span>
              <span className="text-[12px] text-fg-3" title={s.inbox}>
                receipts in {inboxName(s.inbox)}
              </span>
            </li>
          ))}
        </Field>
      ) : null}

      {p.notices.length ? (
        <Field label="Notices">
          {p.notices.map((n) => (
            <li key={n.id} className={`min-w-0 ${n.verified ? "" : "opacity-60"}`}>
              <p className="truncate text-[14px] text-fg" title={n.subject ?? undefined}>
                {noticeText(n, now)}
              </p>
              <p className="text-[12px] text-fg-3">
                <KindTag n={n} now={now} />
                {n.at ? <span title={absoluteTime(n.at)}> · {ago(n.at, now)}</span> : null}
                <span title={n.inbox}> · from {inboxName(n.inbox)}</span>
                {!n.verified ? <span className="text-amber"> · sender not verified</span> : null}
              </p>
            </li>
          ))}
        </Field>
      ) : null}

      {p.openFindings.length ? (
        <Field label="Findings">
          {p.openFindings.map((f) => (
            <li key={f.id} className="flex min-w-0 items-baseline gap-3">
              <Link href="/app/findings" className="min-w-0 truncate text-[14px] text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
                {f.title}
              </Link>
              {f.amountCents !== null ? <span className="num font-mono text-[14px] text-fg-2">{formatCents(f.amountCents)}/mo</span> : null}
            </li>
          ))}
        </Field>
      ) : null}
    </div>
  );
}
