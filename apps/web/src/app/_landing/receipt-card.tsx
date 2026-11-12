import { BUILD_LOG, INCIDENT } from "./incident";

/** The failed-deploy alert for our own production on Nov 9 (see incident.ts), as the email lays it out: the cause, then the last lines of the log. */
export function ReceiptCard() {
  const tail = BUILD_LOG.slice(-6);
  return (
    <div className="slab overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-line-1 px-4 py-3 sm:px-6">
        <p className="text-[12px] text-fg-2">Failed deploy</p>
        <p className="font-mono text-[12px] text-fg-3">Our own, {INCIDENT.date}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-4 pt-5 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 font-mono text-[14px] text-fg sm:text-[16px]">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-red" />
          <span className="truncate">{INCIDENT.project}</span>
        </p>
        <p className="text-[12px] text-fg-2">{INCIDENT.host}</p>
        <p className="pl-3.5 text-[14px] text-red">Production build failed in {INCIDENT.failed.seconds} s</p>
      </div>
      <dl className="mt-5 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line-1 px-4 py-4 text-[14px] sm:grid-cols-[88px_minmax(0,1fr)] sm:px-6">
        <dt className="text-fg-2">Cause</dt>
        <dd className="font-mono text-[13px] leading-[1.5] text-[#f2b8b5]">{INCIDENT.cause}</dd>
        <dt className="text-fg-2">Source</dt>
        <dd className="truncate text-code">Vercel build log</dd>
        <dt className="text-fg-2">Commit</dt>
        <dd className="font-mono text-code">{INCIDENT.failed.commit}</dd>
        <dt className="text-fg-2">Fixed</dt>
        <dd className="text-code">
          <span className="font-mono">{INCIDENT.fixed.commit}</span>, live {INCIDENT.minutesToFix} later
        </dd>
      </dl>
      <pre aria-label="The last lines of the build log" className="border-t whitespace-pre-wrap [overflow-wrap:anywhere] border-line-1 px-4 py-4 font-mono text-[12px] leading-[1.6] text-fg-3 sm:px-6">
        {tail.map((l) => l.text).join("\n")}
      </pre>
    </div>
  );
}
