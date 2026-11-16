"use client";
/**
 * Now, the first page: one thing at a time. The first item on the owner is the page, with its one
 * next step. The rest on the owner is a short queue under it, then what the agents hold, then the
 * last few fixes. Each open item can be cleared, and a clear asks once whether to stop that notice
 * coming back. Reads GET /api/v1/open; clearing and
 * stopping go through /api/v1/notices/clear and /api/v1/mutes, the same calls an agent makes.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonStyles, Chevron, ErrorLine } from "@/components/ui";
import { apiSend, useApi } from "@/components/use-api";
import { duration } from "@/lib/fix-stats";
import type { OpenItem, OpenReport, Prevent, RecentFix } from "@/lib/open-items";
import { type Connection, isRunning } from "./connection-model";
import { agentButton, CopyForAgent } from "./copy-for-agent";
import { absoluteTime } from "./data-model";
import { Onboarding, onboardingComplete } from "./onboarding";
import { Pair, pairLength } from "./pair";
import { ago, projectHref } from "./project-model";

/** What the page can change. Each resolves to an error message, or null when it worked. */
export type Sent = { ok: boolean; message: string };

export type NowActions = {
  clear: (item: OpenItem) => Promise<string | null>;
  restore: (item: OpenItem) => Promise<string | null>;
  stop: (prevent: Prevent) => Promise<string | null>;
  resume: (prevent: Prevent) => Promise<string | null>;
  send: (i: OpenItem) => Promise<Sent>;
};

const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : (r.error ?? "That didn't save. Try again."));

export function NowView() {
  const params = useSearchParams();
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync)) ? 5000 : null),
  });
  const open = useApi<OpenReport>("/api/v1/open", { pollMs: () => 30_000 });
  const { reload } = open;

  // While a sync runs, connections poll and the list refills on the same beat.
  useEffect(() => {
    if (conns.data) void reload();
  }, [conns.data, reload]);

  // The clock is read in an effect, once per refresh: never Date.now() during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [open.data]);

  const after = async (r: { ok: boolean; error?: string }) => {
    await reload();
    return err(r);
  };
  const actions: NowActions = {
    clear: async (i) => after(await apiSend("POST", "/api/v1/notices/clear", { keys: i.clearKeys, project: i.project ?? "", what: i.title })),
    restore: async (i) => after(await apiSend("DELETE", "/api/v1/notices/clear", { keys: i.clearKeys, project: i.project ?? "", what: i.title })),
    stop: async (p) => after(await apiSend("POST", "/api/v1/mutes", { project: p.project, kind: p.kind ?? "all", reason: "Asked after a clear" })),
    resume: async (p) => after(await apiSend("DELETE", "/api/v1/mutes", { project: p.project, kind: p.kind ?? "all" })),
    send: async (i) => {
      const r = await apiSend<{ sent: boolean; message: string }>("POST", "/api/v1/incidents/send", { project: i.project ?? "", what: i.title, jobId: i.jobId });
      await reload();
      return r.data ? { ok: r.data.sent, message: r.data.message } : { ok: false, message: r.error ?? "That didn't send. Try again." };
    },
  };

  return (
    <NowScreen
      ready={Boolean(conns.data) && Boolean(open.data) && now !== null}
      report={open.data}
      connections={conns.data?.connections ?? []}
      params={params}
      error={conns.error ?? open.error}
      now={now ?? 0}
      actions={actions}
    />
  );
}

const words = (n: number) => ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n] ?? String(n);

/** Pure: the sentence the page opens on, and the quieter one about the agents. */
export function nowLead(s: OpenReport["summary"]): { headline: string; sub: string } {
  const agents = s.withAgents ? `Your ${s.agents === 1 ? "agent has" : "agents have"} ${s.withAgents}.` : "";
  if (s.onYou) return { headline: `${words(s.onYou)} ${s.onYou === 1 ? "thing needs" : "things need"} you.`, sub: agents };
  return { headline: s.withAgents ? "Nothing needs you." : "Nothing is open.", sub: agents };
}

/**
 * Pure: true when Now has nothing to show but setup. Open or recently fixed breaks count
 * even with no project watched yet: a job's break must never hide behind the setup list.
 */
export function nowIsEmpty(s: OpenReport["summary"]): boolean {
  return !s.watching && !s.notWatched && !s.open && !s.fixed;
}

/** Pure: what got fixed in the window, in one line. */
export function fixedLine(s: OpenReport["summary"]): string {
  if (!s.fixed) return `Nothing broke in the last ${s.windowDays} days that Spooky saw.`;
  return `${s.fixed} fixed in the last ${s.windowDays} days${s.fixedByAgents ? `, ${s.fixedByAgents} with an agent on it` : ""}.${s.medianFixMinutes === null ? "" : ` Median fix ${duration(s.medianFixMinutes * 60_000)}.`}`;
}

type Done = { item: OpenItem; stage: "cleared" | "stopped"; busy: boolean; error: string | null };

/** Presentational, so the dev preview draws the real screen against fixtures. */
export function NowScreen({
  ready,
  report,
  connections,
  params,
  error,
  now,
  actions,
}: {
  ready: boolean;
  report: OpenReport | null | undefined;
  connections: Connection[];
  params: URLSearchParams;
  error: string | null;
  now: number;
  actions: NowActions;
}) {
  // Items the owner just cleared stay on screen, at the top, until they leave or undo.
  const [done, setDone] = useState<Record<string, Done>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (id: string, patch: Partial<Done>) => setDone((m) => (m[id] ? { ...m, [id]: { ...m[id], ...patch } } : m));
  const drop = (id: string) => setDone((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));

  const clear = async (item: OpenItem) => {
    setDone((m) => ({ ...m, [item.id]: { item, stage: "cleared", busy: true, error: null } }));
    const e = await actions.clear(item);
    if (e) {
      drop(item.id);
      setFailed((m) => ({ ...m, [item.id]: e }));
    } else set(item.id, { busy: false });
  };
  const undo = async (d: Done) => {
    set(d.item.id, { busy: true, error: null });
    const e = (d.stage === "stopped" && d.item.prevent ? await actions.resume(d.item.prevent) : null) ?? (await actions.restore(d.item));
    if (e) set(d.item.id, { busy: false, error: e });
    else drop(d.item.id);
  };
  const stop = async (d: Done) => {
    if (!d.item.prevent) return;
    set(d.item.id, { busy: true, error: null });
    const e = await actions.stop(d.item.prevent);
    set(d.item.id, e ? { busy: false, error: e } : { busy: false, stage: "stopped" });
  };

  const s = report?.summary;
  const setup = ready && (!onboardingComplete(connections) || s?.agents === 0);
  const empty = Boolean(s && nowIsEmpty(s));
  const onboarding = <Onboarding connections={connections} params={params} now={now} agents={s ? s.agents : null} />;
  const lead = s ? nowLead(s) : null;
  const held = Object.values(done);
  const [first, ...queue] = (report?.onYou ?? []).filter((i) => !done[i.id]);
  const theirs = (report?.withAgents ?? []).filter((i) => !done[i.id]);
  const row = (i: OpenItem) => (
    <QueueRow key={i.id} item={i} now={now} open={openId === i.id} onToggle={() => setOpenId((v) => (v === i.id ? null : i.id))} error={failed[i.id] ?? null} onClear={() => void clear(i)} onSend={() => actions.send(i)} />
  );

  return (
    <>
      <h1 className="sr-only">Now</h1>
      {error ? <ErrorLine message={error} /> : null}
      {!ready && !error ? <p className="text-[16px] text-fg-2">Loading…</p> : null}
      {setup && empty ? onboarding : null}

      {ready && report && s && lead && !empty ? (
        <>
          {held.length ? (
            <ul aria-live="polite" className="mb-8 border-t border-line-1">
              {held.map((d) => (
                <ClearedRow key={d.item.id} d={d} onUndo={() => void undo(d)} onStop={() => void stop(d)} onKeep={() => drop(d.item.id)} />
              ))}
            </ul>
          ) : null}

          {first ? (
            <LeadItem item={first} now={now} count={lead.headline} agents={lead.sub} error={failed[first.id] ?? null} onClear={() => void clear(first)} onSend={() => actions.send(first)} />
          ) : (
            <Calm headline={lead.headline} sub={lead.sub} last={report.recentFixes[0] ?? null} now={now} />
          )}

          {setup ? <div className="mb-12 sm:mb-14">{onboarding}</div> : null}

          {queue.length ? (
            <Group id="on-you" title="Then, on you" count={queue.length}>
              {queue.map(row)}
            </Group>
          ) : null}

          {theirs.length ? (
            <Group id="with-agents" title={s.agents === 1 ? "With your agent" : "With your agents"} count={theirs.length}>
              {theirs.map(row)}
            </Group>
          ) : null}

          <section aria-labelledby="fixed-title" className="mb-12">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <div>
                <h2 id="fixed-title" className="text-[18px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
                  Fixed lately
                </h2>
                <p className="num mt-1 text-[14px] leading-[1.5] text-fg-2">{fixedLine(s)}</p>
              </div>
              {report.recentFixes.length ? (
                <Link href="/app/history" className={`inline-flex min-h-11 items-center text-[14px] text-fg-2 hover:text-fg sm:min-h-0 ${link}`}>
                  All history
                </Link>
              ) : null}
            </div>
            {report.recentFixes.length ? (
              <ul className="border-t border-line-1">
                {report.recentFixes.map((f) => (
                  <FixRow key={f.id} fix={f} now={now} />
                ))}
              </ul>
            ) : null}
          </section>

          <p className="num text-[13px] leading-[1.6] text-fg-3">
            Watching {s.watching} {s.watching === 1 ? "project" : "projects"}
            {" · "}
            {s.agents ? (
              <Link href="/app/agents" className="hover:text-fg">
                {s.agents} {s.agents === 1 ? "agent" : "agents"} connected
              </Link>
            ) : (
              <Link href="/app/agents" className={`text-fg-2 hover:text-fg ${link}`}>
                Connect an agent
              </Link>
            )}
            {s.notWatched ? (
              <>
                {" · "}
                <Link href="/app/settings#stopped" className="hover:text-fg">
                  {s.notWatched} not watched
                </Link>
              </>
            ) : null}
            {" · "}
            <span title={absoluteTime(report.checkedAt)}>checked {ago(report.checkedAt, now)}</span>
          </p>
        </>
      ) : null}
    </>
  );
}

function Group({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mb-12 sm:mb-14">
      <h2 id={`${id}-title`} className="mb-3 flex items-baseline gap-2.5 text-[18px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
        {title}
        <span className="num text-[14px] font-normal tracking-normal text-fg-2">{count}</span>
      </h2>
      <ul className="border-t border-line-1">{children}</ul>
    </section>
  );
}

/** Red when something is down or failing; amber when it only needs a decision. */
const toneOf = (item: OpenItem): "red" | "amber" => (item.kind === "check" || item.kind === "connection" || item.kind === "stale_push" || item.kind === "job_never" ? "amber" : "red");
const link = "underline decoration-line-3 underline-offset-4 hover:decoration-fg";
const DASH = "pair-open bg-[repeating-linear-gradient(to_right,var(--fg-3)_0_4px,transparent_4px_8px)]";

/** What the owner can do with one item: open it, hand it to an agent, clear it. `lead` makes the first one a button. */
function Actions({ item, lead = false, error, onClear, onSend }: { item: OpenItem; lead?: boolean; error: string | null; onClear: () => void; onSend: () => Promise<Sent> }) {
  const go = lead ? buttonStyles.primary : `${agentButton} text-fg ${link}`;
  const [send, setSend] = useState<"idle" | "sending" | Sent>("idle");
  const sendNow = async () => {
    setSend("sending");
    setSend(await onSend());
  };
  return (
    <>
      <div className={`flex flex-wrap items-center gap-x-1 gap-y-2 ${lead ? "" : "-ml-3"}`}>
        {item.link ? (
          item.link.external ? (
            <a href={item.link.href} target="_blank" rel="noreferrer" className={go}>
              {item.link.label}
            </a>
          ) : (
            <Link href={item.link.href} className={go}>
              {item.link.label}
            </Link>
          )
        ) : null}
        {item.sendable ? (
          <button type="button" onClick={() => void sendNow()} disabled={send === "sending"} className={`${agentButton} text-fg ${link} disabled:opacity-60`}>
            {send === "sending" ? "Sending…" : "Send to my agent now"}
          </button>
        ) : null}
        {item.prompt ? <CopyForAgent prompt={item.prompt} /> : null}
        {item.clearKeys.length ? (
          <button type="button" onClick={onClear} className={`${agentButton} text-fg-2 hover:text-fg`}>
            Clear
          </button>
        ) : null}
      </div>
      {typeof send === "object" ? (
        <p role="status" className={`mt-1 max-w-[60ch] text-[13px] leading-[1.45] ${send.ok ? "text-fg-2" : "text-red"}`}>
          {send.message}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-[13px] text-red">{error}</p> : null}
    </>
  );
}

/** The first thing on the owner, as the page: one particle waiting for its pair, what happened, the one next step. */
function LeadItem({ item, now, count, agents, error, onClear, onSend }: { item: OpenItem; now: number; count: string; agents: string; error: string | null; onClear: () => void; onSend: () => Promise<Sent> }) {
  const ms = item.since ? now - Date.parse(item.since) : null;
  const red = toneOf(item) === "red";
  return (
    <section aria-labelledby="lead-title" className="mb-12 sm:mb-16">
      <p className="num text-[14px] leading-[1.5] text-fg-2">
        <span className="text-fg">{count}</span> {agents} This one is first.
      </p>
      <div aria-hidden className="mt-7 flex items-center sm:mt-9">
        <span className={`size-[11px] shrink-0 rounded-full ${red ? "bg-red" : "bg-amber"}`} />
        <span style={{ width: pairLength(ms) * 4 }} className={`mx-1.5 h-px max-w-[55%] shrink ${DASH}`} />
        <span className="size-[11px] shrink-0 rounded-full ring-1 ring-fg-3 ring-inset" />
      </div>
      <p className="num mt-3 font-mono text-[13px] text-fg-2">
        {item.since ? <span title={absoluteTime(item.since)}>open {duration(ms ?? 0)}, </span> : null}
        waiting on you
      </p>
      <h2 id="lead-title" className="mt-5 max-w-[22ch] text-[30px] leading-[1.1] font-medium tracking-[-0.028em] text-balance text-fg sm:text-[46px]">
        {item.title}
      </h2>
      {item.project ? (
        item.project.includes("/") ? (
          <Link href={projectHref(item.project)} className="mt-3 inline-block font-mono text-[14px] text-fg-2 hover:text-fg">
            {item.project}
          </Link>
        ) : (
          <p className="mt-3 font-mono text-[14px] text-fg-2">{item.project}</p>
        )
      ) : null}
      <p className="mt-6 max-w-[58ch] text-[16px] leading-[1.55] text-pretty text-fg-2">{item.happened}</p>
      <p className="mt-1.5 max-w-[58ch] text-[16px] leading-[1.55] text-pretty text-fg">{item.todo}</p>
      <div className="mt-7">
        <Actions item={item} lead error={error} onClear={onClear} onSend={onSend} />
      </div>
    </section>
  );
}

/** Nothing on the owner: say so, and show the last pair that closed. */
function Calm({ headline, sub, last, now }: { headline: string; sub: string; last: RecentFix | null; now: number }) {
  return (
    <section aria-label="Where things stand" className="mb-12 sm:mb-16">
      {last ? (
        <>
          <div aria-hidden className="flex items-center">
            <span className="size-[11px] shrink-0 rounded-full bg-red" />
            <span style={{ width: pairLength(Date.parse(last.fixedAt) - Date.parse(last.caughtAt)) * 4 }} className="mx-1.5 h-px max-w-[55%] shrink bg-line-3" />
            <span className="size-[11px] shrink-0 rounded-full bg-live" />
          </div>
          <p className="num mt-3 font-mono text-[13px] text-fg-2">
            last fix took {last.took}, <span title={absoluteTime(last.fixedAt)}>{ago(last.fixedAt, now)}</span>
          </p>
        </>
      ) : null}
      <p className="mt-5 max-w-[22ch] text-[30px] leading-[1.1] font-medium tracking-[-0.028em] text-balance text-fg sm:text-[46px]">{headline}</p>
      {sub ? <p className="num mt-4 text-[16px] leading-[1.55] text-fg-2">{sub}</p> : null}
    </section>
  );
}

/** One item in a queue: a line to scan, and the rest on demand. */
function QueueRow({ item, now, open, onToggle, error, onClear, onSend }: { item: OpenItem; now: number; open: boolean; onToggle: () => void; error: string | null; onClear: () => void; onSend: () => Promise<Sent> }) {
  const ms = item.since ? now - Date.parse(item.since) : null;
  const tone = toneOf(item);
  return (
    <li className="border-b border-line-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="group -mx-2 grid w-[calc(100%+16px)] grid-cols-[10px_minmax(0,1fr)_auto_14px] items-center gap-x-3 rounded-lg px-2 py-3 text-left outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-fg/40 sm:grid-cols-[88px_minmax(0,1fr)_auto_14px] sm:gap-x-5"
      >
        <span className="hidden sm:block">
          <Pair ms={ms} state={item.waiting ? "waiting" : "open"} tone={tone} />
        </span>
        <span aria-hidden className={`size-2 rounded-full sm:hidden ${item.waiting ? `ring-1 ring-inset ${tone === "red" ? "ring-red" : "ring-amber"}` : tone === "red" ? "bg-red" : "bg-amber"}`} />
        <span className="min-w-0">
          <span className="block text-[15px] leading-[1.4] text-pretty text-fg">
            {item.title}
            {item.count > 1 && item.kind !== "check" ? <span className="num ml-2 font-mono text-[12px] text-fg-3">×{item.count}</span> : null}
            {item.project ? <span className="block font-mono text-[13px] text-fg-2 sm:ml-3 sm:inline sm:whitespace-nowrap">{item.project}</span> : null}
          </span>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-pretty text-fg-2">{item.owner === "agents" ? item.who : item.todo}</span>
        </span>
        <span className="num font-mono text-[13px] whitespace-nowrap text-fg-2" title={item.since ? absoluteTime(item.since) : undefined}>
          {ms === null ? "" : duration(ms)}
        </span>
        <Chevron open={open} className="size-3.5 text-fg-3 group-hover:text-fg" />
      </button>
      {open ? (
        <div className="pt-1 pb-5 pl-[22px] sm:pl-[108px]">
          <p className="max-w-[64ch] text-[14px] leading-[1.55] text-pretty text-fg-2">{item.happened}</p>
          {item.owner === "agents" ? (
            <p className="mt-1 max-w-[64ch] text-[14px] leading-[1.55] text-pretty text-fg">{item.todo}</p>
          ) : (
            <p className="mt-1 max-w-[64ch] text-[14px] leading-[1.55] text-pretty text-fg-2">{item.who}</p>
          )}
          <div className="mt-2">
            <Actions item={item} error={error} onClear={onClear} onSend={onSend} />
          </div>
        </div>
      ) : error ? (
        <p className="pb-3 pl-[22px] text-[13px] text-red sm:pl-[108px]">{error}</p>
      ) : null}
    </li>
  );
}

/** A cleared item, held at the top: undo it, and answer once whether to stop it coming back. */
function ClearedRow({ d, onUndo, onStop, onKeep }: { d: Done; onUndo: () => void; onStop: () => void; onKeep: () => void }) {
  const p = d.item.prevent;
  return (
    <li className="grid gap-x-5 border-b border-line-1 py-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <div className="hidden sm:block sm:pt-[9px]">
        <Pair ms={null} state="closed" />
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 text-[14px] leading-[1.5] text-fg-2">
          <span className="min-w-0">
            {d.stage === "stopped" ? "Stopped. " : "Cleared. "}
            <span className="text-fg-3">
              {d.item.title}
              {d.item.project ? `, ${d.item.project}` : ""}
            </span>
          </span>
          <button type="button" disabled={d.busy} onClick={onUndo} className={`inline-flex min-h-11 items-center text-fg ${link} disabled:opacity-60 sm:min-h-0`}>
            Undo
          </button>
        </p>
        {p && d.stage === "cleared" ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[16px] leading-[1.45] text-pretty text-fg">{p.ask}</p>
            <div className="flex gap-2">
              <button type="button" disabled={d.busy} onClick={onStop} className={buttonStyles.secondary}>
                Stop watching
              </button>
              <button type="button" disabled={d.busy} onClick={onKeep} className={buttonStyles.ghost}>
                Keep watching
              </button>
            </div>
          </div>
        ) : null}
        {p && d.stage === "stopped" ? (
          <p className="mt-1 text-[13px] leading-[1.5] text-fg-2">
            Nothing was deleted. History keeps what already happened, and{" "}
            <Link href="/app/settings#stopped" className={link}>
              Settings
            </Link>{" "}
            lists what is stopped.
          </p>
        ) : null}
        {d.error ? <p className="mt-1 text-[13px] text-red">{d.error}</p> : null}
      </div>
    </li>
  );
}

/** One finished pair: the line's length is how long the fix took. */
export function FixRow({ fix, now }: { fix: RecentFix; now: number }) {
  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-x-5 border-b border-line-1 py-3 sm:grid-cols-[88px_56px_minmax(0,1fr)_auto]">
      <Pair ms={Date.parse(fix.fixedAt) - Date.parse(fix.caughtAt)} state="fixed" className="self-center" />
      <span className="num font-mono text-[13px] text-fg">{fix.took}</span>
      <span className="col-span-2 min-w-0 text-[14px] leading-[1.45] text-pretty text-fg-2 sm:col-span-1">
        <span className="text-fg">{fix.what}</span>
        {fix.project ? <span className="block font-mono text-[13px] sm:ml-3 sm:inline sm:whitespace-nowrap">{fix.project}</span> : null}
        {fix.by ? <span className="block text-[13px] sm:inline sm:before:mx-2 sm:before:content-['·']">{fix.by}</span> : null}
      </span>
      <span className="num col-span-2 font-mono text-[12px] text-fg-3 sm:col-span-1 sm:text-right" title={absoluteTime(fix.fixedAt)}>
        {ago(fix.fixedAt, now)}
      </span>
    </li>
  );
}
