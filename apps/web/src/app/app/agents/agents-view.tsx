"use client";
/**
 * Agents: the coding agents and computers that hold a key, and what each one did with it. Which
 * projects it asked about, what it holds right now, and what was fixed after it heard. Connect
 * one here, revoke one here. Reads GET /api/v1/agents; keys are made and revoked through
 * /api/v1/api-keys, which only a signed-in person can call.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Empty, ErrorLine, PageHeader, SectionTitle, buttonStyles } from "@/components/ui";
import { apiPost, apiSend, useApi } from "@/components/use-api";
import type { AgentView, AgentsReport } from "@/lib/agents";
import { absoluteTime } from "../data-model";
import { Pair } from "../pair";
import { ago } from "../project-model";
import { projectHref } from "../project-model";
import { ConnectAgent, RevokeControl, scopeWords, type KeyAccess, type NewKey } from "./connect-agent";

type Create = (name: string, access: KeyAccess, expiresOn: string | null) => Promise<NewKey | string>;

export function AgentsView() {
  const agents = useApi<AgentsReport>("/api/v1/agents", { pollMs: () => 60_000 });
  // The clock is read in an effect, once per refresh: never Date.now() during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [agents.data]);

  const create: Create = async (name, access, expiresOn) => {
    const r = await apiPost<{ apiKey?: NewKey } & Partial<NewKey>>("/api/v1/api-keys", { name, scopes: access === "write" ? ["read", "write"] : ["read"], expiresOn });
    if (!r.ok || !r.data) return r.error ?? "That key wasn't made. Try again.";
    await agents.reload();
    return (r.data.apiKey ?? r.data) as NewKey;
  };
  const revoke = async (id: string): Promise<string | null> => {
    const r = await apiSend("DELETE", `/api/v1/api-keys/${encodeURIComponent(id)}`);
    await agents.reload();
    return r.ok ? null : (r.error ?? "That didn't revoke. Try again.");
  };

  if (agents.error) return <ErrorLine message={agents.error} />;
  return <AgentsScreen report={now === null ? null : agents.data} now={now ?? 0} onCreate={create} onRevoke={revoke} />;
}

const link = "underline decoration-line-3 underline-offset-4 hover:decoration-fg";

/** Presentational, so the dev preview draws the real screen against fixtures. */
export function AgentsScreen({ report, now, onCreate, onRevoke }: { report: AgentsReport | null; now: number; onCreate: Create; onRevoke: (id: string) => Promise<string | null> }) {
  const [connecting, setConnecting] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const live = report?.agents.filter((a) => a.state === "live") ?? [];
  const gone = report?.agents.filter((a) => a.state !== "live") ?? [];
  const s = report?.summary;

  return (
    <>
      <PageHeader title="Agents" lede="The coding agents that hear about your breaks, and what each one did. Read only unless you choose otherwise. Revoke one and its key stops working at once.">
        {!connecting ? (
          <button type="button" className={buttonStyles.primary} onClick={() => setConnecting(true)}>
            Connect an agent
          </button>
        ) : null}
      </PageHeader>

      {connecting ? <ConnectAgent now={now} onCreate={onCreate} onClose={() => setConnecting(false)} /> : null}
      {!report ? <p className="text-[16px] text-fg-2">Loading…</p> : null}

      {report && s && live.length ? (
        <>
          <p className="num mb-3 text-[14px] text-fg-2">
            {s.live} connected · {s.listening} asked in the last 14 days · {s.fixed} {s.fixed === 1 ? "fix" : "fixes"} after an agent asked, last 30 days
          </p>
          <ul className="border-t border-line-1">
            {live.map((a) => (
              <AgentRow key={a.id} a={a} now={now} onRevoke={() => onRevoke(a.id)} />
            ))}
          </ul>
        </>
      ) : null}

      {report && !live.length && !connecting ? (
        <Empty
          title="No agent is connected."
          action={
            <button type="button" className={buttonStyles.secondary} onClick={() => setConnecting(true)}>
              Connect an agent
            </button>
          }
        >
          Until one is, every break is on you. Connect Claude Code, Codex or Cursor once and failed deploys and jobs go to it first, with the cause.
        </Empty>
      ) : null}

      {report?.unheard.length ? (
        <section aria-labelledby="unheard-title" className="mt-14">
          <SectionTitle id="unheard-title" count={report.unheard.length}>
            Broken, and no agent has asked
          </SectionTitle>
          <p className="-mt-2 mb-3 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
            An agent hears about a project once it has worked in it. Open a session in the project and paste the setup prompt.
          </p>
          <ul className="border-t border-line-1">
            {report.unheard.map((u) => (
              <li key={u.project} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-1 py-3">
                <Pair ms={null} state="open" className="self-center" />
                {u.project.includes("/") ? (
                  <Link href={projectHref(u.project)} className={`min-w-0 flex-1 truncate font-mono text-[14px] text-fg ${link}`}>
                    {u.project}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-fg">{u.project}</span>
                )}
                <span className="num text-[13px] text-red">{u.open} open</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {gone.length ? (
        <section className="mt-10">
          <button type="button" aria-expanded={showGone} onClick={() => setShowGone((v) => !v)} className={`inline-flex min-h-11 items-center text-[14px] text-fg-2 hover:text-fg ${link}`}>
            {showGone ? "Hide revoked and expired" : `${gone.length} revoked or expired`}
          </button>
          {showGone ? (
            <ul className="border-t border-line-1">
              {gone.map((a) => (
                <AgentRow key={a.id} a={a} now={now} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** One agent: who it is, what it asked about, what it holds, and its last pair. */
function AgentRow({ a, now, onRevoke }: { a: AgentView; now: number; onRevoke?: () => Promise<string | null> }) {
  const used =
    a.state === "revoked" && a.revokedAt ? (
      <span title={absoluteTime(a.revokedAt)}>Revoked {ago(a.revokedAt, now)}</span>
    ) : a.state === "expired" ? (
      "Expired"
    ) : a.lastUsedAt ? (
      <span title={absoluteTime(a.lastUsedAt)}>Used {ago(a.lastUsedAt, now)}</span>
    ) : (
      "Never used"
    );
  const more = a.askedTotal - a.asked.length;
  return (
    <li className={`grid gap-x-6 gap-y-3 border-b border-line-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${a.state === "live" ? "" : "opacity-60"}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="min-w-0 text-[16px] leading-[1.35] break-words text-fg">{a.name}</span>
          <span className="text-[13px] text-fg-2">{used}</span>
        </p>
        <p className="mt-0.5 text-[13px] text-fg-3">
          key <span className="font-mono">{a.prefix}…</span> · {scopeWords(a.scopes)} · made <span title={absoluteTime(a.createdAt)}>{ago(a.createdAt, now)}</span>
          {a.expiresAt && a.state === "live" ? ` · expires ${new Date(a.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
        </p>

        {a.claims.length ? (
          <p className="mt-3 flex items-start gap-2 text-[14px] leading-[1.5] text-fg">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-red" />
            <span>
              Working on {a.claims.map((c) => c.project).join(", ")} since <span title={absoluteTime(a.claims[0].at)}>{ago(a.claims[0].at, now)}</span>
            </span>
          </p>
        ) : null}

        <p className="mt-3 text-[14px] leading-[1.6] text-fg-2">
          {a.asked.length ? (
            <>
              Asked about{" "}
              {a.asked.map((p, i) => (
                <span key={p.project}>
                  <span className="font-mono text-[13px] whitespace-nowrap text-fg" title={`Last asked ${absoluteTime(p.at)}`}>
                    {p.project}
                  </span>
                  {i < a.asked.length - 1 ? ", " : ""}
                </span>
              ))}
              {more > 0 ? ` and ${more} more` : ""} in the last 14 days.
            </>
          ) : a.state === "live" ? (
            "Has not asked about any project in the last 14 days, so it hears about no breaks."
          ) : null}
        </p>

        {a.lastFix ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] leading-[1.5] text-fg-2">
            <Pair ms={Date.parse(a.lastFix.fixedAt) - Date.parse(a.lastFix.caughtAt)} state="fixed" />
            <span className="num font-mono text-[13px] text-fg">{a.lastFix.took}</span>
            <span className="min-w-0">
              {a.lastFix.what}
              {a.lastFix.project ? <span className="font-mono text-[13px] whitespace-nowrap"> · {a.lastFix.project}</span> : null}
            </span>
            <span className="num text-[13px] text-fg-3">
              {a.fixed} fixed after it asked, last 30 days
            </span>
          </p>
        ) : null}
      </div>
      {onRevoke ? <RevokeControl onRevoke={onRevoke} /> : null}
    </li>
  );
}
