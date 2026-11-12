import { INCIDENT } from "./incident";

/**
 * The hand-off, shown on real data: our own Nov 9 failure (incident.ts) laid out the way the
 * agent inbox prints it (formatIncidentsText in lib/incidents.ts, `?format=text`), which is what
 * Claude Code reads at session start. The deployment link and the confirm command are shortened; every other value is the
 * incident's own. Not a claim that an agent read this one on Nov 9: the inbox shipped later.
 */
/** The confirm step, as the request it makes: the real line is the full curl command with the key piped in. */
const CONFIRM_PATH = "GET /api/v1/incidents";

export function AgentInbox() {
  return (
    <figure className="slab overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-line-1 px-4 py-3 sm:px-6">
        <p className="flex items-center gap-2 text-[12px] text-fg-2">
          <span aria-hidden className="size-1.5 rounded-full bg-red" />
          Claude Code, session start
        </p>
        <p className="font-mono text-[12px] text-fg-3">{INCIDENT.project}</p>
      </div>
      <pre className="px-4 py-5 font-mono text-[12px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:break-word] text-code sm:px-6 sm:text-[13px]">
        <span className="text-fg">Spooky Particles: 1 open problem for <span className="whitespace-nowrap">{INCIDENT.project}</span></span>
        {"\n\n"}
        <span className="text-red">Deploy failed:</span> {INCIDENT.project} ({INCIDENT.environment} on {INCIDENT.host})
        {"\n"}
        <span className="text-fg-3">When:</span> 2026-11-09T{INCIDENT.failed.failedAt}.000Z
        {"\n"}
        <span className="text-fg-3">Build log:</span> <span className="text-cause">{INCIDENT.cause}</span>
        {"\n"}
        <span className="text-fg-3">Link:</span> https://vercel.com/…
        {"\n\n"}
        <span className="text-fg-3">Fix the cause, then confirm with:</span>
        {"\n"}
        <span className="text-fg-2">
          {CONFIRM_PATH}
          <wbr />
          <span className="whitespace-nowrap">?project={INCIDENT.project}</span>
        </span>
      </pre>
      <figcaption className="border-t border-line-1 px-4 py-3 font-mono text-[11px] text-fg-3 sm:px-6">Our own Nov 9 failure, as the agent inbox prints it.</figcaption>
    </figure>
  );
}
