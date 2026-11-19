"use client";
/**
 * What an AI agent gets from each Vercel site. A client of GET /api/v1/agent-view (MCP agent_view).
 * It reads every site live, so it runs when asked, not on every page view.
 */
import { useState } from "react";
import { SectionTitle, buttonStyles, surface } from "@/components/ui";
import type { AgentView } from "@/lib/agent-view";

type Report = { checkedAt: string; sites: AgentView[] };

const kb = (bytes: number | null) => bytes === null ? "none" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Fact({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-fg-3">{label}</dt>
      <dd className={`num font-mono text-[13px] ${good === false ? "text-fg-3" : "text-fg"}`}>{value}</dd>
    </div>
  );
}

export function AgentViewScreen({ report, error, busy, onRun }: { report: Report | null; error: string | null; busy: boolean; onRun: () => void }) {
  return (
    <section className="mt-12" aria-labelledby="check-agent-view">
      <SectionTitle id="check-agent-view" count={report?.sites.length}>What AI agents get</SectionTitle>
      <p className="mb-3 text-[13px] text-pretty text-fg-3">How much an agent reads from each home page to get its words, and whether a plain Markdown version or an llms.txt answers. Spooky only reads; it changes nothing.</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRun} disabled={busy} className={buttonStyles.secondary}>{busy ? "Reading your sites…" : report ? "Check again" : "Check my sites"}</button>
        {report ? <span className="text-[12px] text-fg-3">Checked {new Date(report.checkedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span> : null}
      </div>
      {error ? <p role="alert" className="text-[13px] text-red">{error}</p> : null}
      {report && !report.sites.length ? <p className="text-[13px] text-fg-3">No Vercel sites yet. Connect Vercel to see them here.</p> : null}
      {report?.sites.length ? <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
        {report.sites.map((s) => (
          <div key={s.project} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 font-mono text-[14px] break-words text-fg">{s.project}</p>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[12px] text-fg-3 hover:text-fg">{s.url.replace(/^https:\/\//, "").replace(/\/$/, "")}</a> : null}
            </div>
            <p className="mt-1 text-[13px] text-pretty text-fg-2">{s.summary}{s.state === "ok" && !s.markdown.served ? <> <a href="/docs/markdown-for-agents" className="text-fg underline decoration-line-3 underline-offset-2 hover:decoration-fg">How to add one</a></> : null}</p>
            {s.page ? <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Fact label="Page" value={`${s.page.capped ? ">" : ""}${kb(s.page.bytes)}`} />
              <Fact label="Words" value={s.page.words.toLocaleString("en-US")} />
              <Fact label="Markdown" value={s.markdown.served ? kb(s.markdown.bytes) : "none"} good={s.markdown.served} />
              <Fact label="llms.txt" value={s.llmsTxt.served ? kb(s.llmsTxt.bytes) : "none"} good={s.llmsTxt.served} />
            </dl> : null}
          </div>
        ))}
      </div> : null}
    </section>
  );
}

export function AgentViewPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/agent-view", { credentials: "same-origin" });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "Could not read your sites. Try again.");
      else setReport(body as Report);
    } catch { setError("Could not read your sites. Try again."); }
    setBusy(false);
  }
  return <AgentViewScreen report={report} error={error} busy={busy} onRun={() => void run()} />;
}
