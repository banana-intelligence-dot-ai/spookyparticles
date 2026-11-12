"use client";
import { useState } from "react";
import { Empty, SectionTitle, buttonStyles, surface } from "@/components/ui";
import { apiSend } from "@/components/use-api";
import type { Expiration, TrackedExpirationKind } from "@/lib/expirations/expirations";

export type ExpirationReport = { items: Expiration[]; unknownDomains: { name: string; reason: string }[] };

const field = "h-11 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TRACKED = new Set<Expiration["kind"]>(["api_key", "token", "certificate", "other"]);
const KIND_LABEL: Record<Expiration["kind"], string> = {
  api_key: "API key", certificate: "Certificate", domain: "Domain", node_runtime: "Runtime", other: "Other", spooky_key: "Spooky key", token: "Token",
};

export function ExpirationsPanel({ report, error, reload }: { report: ExpirationReport | null; error: string | null; reload?: () => Promise<void> }) {
  const [kind, setKind] = useState<TrackedExpirationKind>("api_key");
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [hint, setHint] = useState("");
  const [project, setProject] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function add() {
    setBusy("add");
    setActionError(null);
    const result = await apiSend("POST", "/api/v1/expirations", { kind, provider: provider || null, name, hint: hint || null, project: project || null, expiresOn });
    setBusy(null);
    if (!result.ok) return setActionError(result.error ?? "Could not add that date.");
    setName("");
    setHint("");
    setExpiresOn("");
    await reload?.();
  }

  async function remove(id: string) {
    setBusy(id);
    setActionError(null);
    const result = await apiSend("DELETE", `/api/v1/expirations/${encodeURIComponent(id)}`);
    setBusy(null);
    setConfirming(null);
    if (!result.ok) return setActionError(result.error ?? "Could not remove that date.");
    await reload?.();
  }

  return (
    <section className="mt-12" aria-labelledby="check-expirations">
      <SectionTitle id="check-expirations" count={report ? report.items.length + report.unknownDomains.length : undefined}>Expirations</SectionTitle>
      {error ? <p role="alert" className="text-[14px] text-red">Could not load expirations.</p> : null}
      {!report && !error ? <p className="text-[14px] text-fg-3">Loading…</p> : null}
      {report && !report.items.length && !report.unknownDomains.length ? (
        <Empty title="No expirations yet">Known dates from Vercel appear here. Add the expiry of an API key or token so Spooky warns you 30, 7 and 1 days ahead.</Empty>
      ) : null}
      {report && (report.items.length || report.unknownDomains.length) ? (
        <div className={`divide-y divide-line-1 overflow-hidden ${surface}`}>
          {report.items.map((item) => {
            const removable = Boolean(item.id && TRACKED.has(item.kind));
            return (
              <div key={`${item.kind}:${item.id ?? item.project ?? ""}:${item.name}:${item.date}`} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                <div className="min-w-44 flex-1">
                  <p className="text-[14px] text-fg">
                    {item.provider ? <span className="mr-2 text-fg-2">{item.provider}</span> : null}
                    <span className="font-mono">{item.name}</span>
                    {item.hint ? <span className="ml-2 font-mono text-[12px] text-fg-3">{item.kind === "spooky_key" ? `${item.hint}…` : `…${item.hint}`}</span> : null}
                  </p>
                  <p className="text-[12px] text-fg-3">{item.project ? `${item.project} · ` : ""}{item.kind === "domain" && item.autoRenew ? "Domain · auto-renew on" : KIND_LABEL[item.kind]}</p>
                </div>
                <time dateTime={item.date} className="num text-[12px] text-fg-2">{item.date}</time>
                <span className="num w-20 text-right text-[12px] text-fg">{item.daysLeft < 0 ? "Expired" : item.daysLeft === 0 ? "Today" : `${item.daysLeft}d left`}</span>
                {removable ? confirming === item.id ? (
                  <div className="flex gap-2">
                    <button type="button" className={buttonStyles.ghost} onClick={() => setConfirming(null)}>Keep</button>
                    <button type="button" className={`${buttonStyles.danger} text-red`} disabled={busy === item.id} onClick={() => void remove(item.id!)}>{busy === item.id ? "Removing…" : "Remove"}</button>
                  </div>
                ) : (
                  <button type="button" className={buttonStyles.quietDanger} onClick={() => setConfirming(item.id!)}>Remove</button>
                ) : null}
              </div>
            );
          })}
          {report.unknownDomains.map((domain) => (
            <div key={domain.name} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5 sm:px-5">
              <span className="min-w-0 flex-1 font-mono text-[14px] text-fg">{domain.name}</span>
              <span className="text-[12px] text-fg-3">{domain.reason}</span>
            </div>
          ))}
        </div>
      ) : null}

      <form className={`mt-4 p-4 sm:p-5 ${surface}`} onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <p className="mb-3 text-[14px] font-medium text-fg">Add a date</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Kind</span><select className={field} value={kind} onChange={(e) => setKind(e.target.value as TrackedExpirationKind)}><option value="api_key">API key</option><option value="token">Token</option><option value="certificate">Certificate</option><option value="other">Other</option></select></label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Provider</span><input className={field} value={provider} maxLength={40} placeholder="Anthropic" onChange={(e) => setProvider(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Name</span><input className={field} value={name} maxLength={80} required placeholder="news-factory" onChange={(e) => setName(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Last 4 (optional)</span><input className={field} value={hint} maxLength={6} placeholder="a1b2" onChange={(e) => setHint(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Project (optional)</span><input className={field} value={project} maxLength={120} onChange={(e) => setProject(e.target.value)} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[12px] text-fg-2">Date</span><input type="date" className={field} value={expiresOn} required onChange={(e) => setExpiresOn(e.target.value)} /></label>
        </div>
        <div className="mt-4 flex min-h-11 items-center gap-3">
          <button type="submit" className={buttonStyles.primary} disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add date"}</button>
          <p className="text-[12px] text-fg-3">Never paste the key or token itself.</p>
        </div>
        {actionError ? <p role="alert" className="mt-2 text-[13px] text-red">{actionError}</p> : null}
      </form>
    </section>
  );
}
