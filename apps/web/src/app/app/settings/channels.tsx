"use client";
/**
 * Where alerts go when no agent fixes a break in time: phone, Slack, Teams or email. Reads and
 * writes /api/v1/alert-channels; targets are stored encrypted and shown masked.
 */
import { useState } from "react";
import { List, SectionTitle, buttonStyles } from "@/components/ui";
import { apiPost, apiSend } from "@/components/use-api";
import { INPUT } from "../jobs/job-settings";

export type Channel = { id: string; kind: "ntfy" | "slack" | "teams" | "email"; label: string; project: string | null; enabled: boolean; lastOkAt: string | null; lastError: string | null };

const KIND_LABEL: Record<Channel["kind"], string> = { ntfy: "Phone (ntfy)", slack: "Slack", teams: "Microsoft Teams", email: "Email" };
const KIND_HINT: Record<Channel["kind"], string> = {
  ntfy: "A topic name on ntfy.sh (install the ntfy app, subscribe to the same topic), or a full https topic URL on your own server.",
  slack: "An incoming webhook URL from hooks.slack.com (Slack app settings, Incoming Webhooks, Add New Webhook).",
  teams: "The URL of a Workflows “Post to a channel when a webhook request is received” flow, or a classic incoming webhook.",
  email: "An address. With no channel at all, alerts go to your account email.",
};

export function Channels({ list, loading, onChanged, onNotice }: { list: Channel[]; loading: boolean; onChanged: () => void; onNotice: (m: string) => void }) {
  const [kind, setKind] = useState<Channel["kind"]>("ntfy");
  const [target, setTarget] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const generateTopic = () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setTarget(Array.from(bytes, (byte) => alphabet[byte & 63]).join(""));
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add");
    setError(null);
    const r = await apiPost("/api/v1/alert-channels", { kind, target, project: project.trim() || null });
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? "That channel was not added.");
      return;
    }
    setTarget("");
    setProject("");
    setAdding(false);
    onChanged();
  };
  const test = async (id: string) => {
    setBusy(id);
    setSent(null);
    const r = await apiPost(`/api/v1/alert-channels/${id}/test`);
    setBusy(null);
    if (!r.ok) onNotice(r.error ?? "The test did not go through.");
    else setSent(id);
    onChanged();
  };
  const remove = async (id: string) => {
    setBusy(id);
    const r = await apiSend("DELETE", `/api/v1/alert-channels/${id}`);
    setBusy(null);
    if (!r.ok) onNotice(r.error ?? "That did not remove.");
    onChanged();
  };

  return (
    <section aria-labelledby="channels-title" className="mb-12">
      <SectionTitle
        id="channels-title"
        count={list.length || undefined}
        action={
          <button type="button" className={buttonStyles.ghost} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Add a channel"}
          </button>
        }
      >
        Where alerts go
      </SectionTitle>
      {!list.length && !loading ? <p className="mb-4 border-y border-line-1 py-4 text-[14px] text-fg-2">Nothing set, so alerts go to your account email. Add your phone or a channel.</p> : null}
      {list.length ? (
        <List plain>
          {list.map((c) => (
            <li key={c.id} className="border-b border-line-1 px-4 py-3 last:border-b-0 sm:flex sm:items-center sm:gap-x-4 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${c.lastError ? "bg-amber" : c.lastOkAt ? "bg-accent" : "ring-1 ring-inset ring-line-3"}`} />
                <span className="shrink-0 text-[14px] text-fg">{KIND_LABEL[c.kind]}</span>
                <span className="min-w-0 truncate font-mono text-[13px] text-fg-2">{c.label}</span>
                {c.project ? <span className="min-w-0 truncate font-mono text-[12px] text-fg-2">Project: {c.project}</span> : null}
              </div>
              <div className="mt-2 flex items-center gap-2 pl-[19px] sm:mt-0 sm:pl-0">
                {c.lastError ? <span className="mr-auto text-[12px] text-amber">{c.lastError}</span> : sent === c.id ? <span className="mr-auto text-[12px] text-fg-2">sent</span> : <span className="mr-auto text-[12px] text-fg-3">{c.lastOkAt ? "Working" : "Not tested yet"}</span>}
                <button type="button" className={buttonStyles.ghost} disabled={busy === c.id} onClick={() => test(c.id)}>Send a test</button>
                <button type="button" className={buttonStyles.quietDanger} disabled={busy === c.id} onClick={() => remove(c.id)}>Remove</button>
              </div>
            </li>
          ))}
        </List>
      ) : null}
      {adding ? (
      <form onSubmit={add} className="mt-5 border-b border-line-1 pb-6">
        <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-end">
          <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
            Channel
            <select value={kind} onChange={(e) => setKind(e.target.value as Channel["kind"])} className={INPUT}>
              {(Object.keys(KIND_LABEL) as Channel["kind"][]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5 text-[14px] text-fg-2">
            <label htmlFor="channel-target">{kind === "ntfy" ? "Topic" : kind === "email" ? "Address" : "Webhook URL"}</label>
            <div className="flex gap-2">
              <input id="channel-target" value={target} onChange={(e) => setTarget(e.target.value)} autoComplete="off" spellCheck={false} className={`${INPUT} min-w-0 flex-1 font-mono`} required />
              {kind === "ntfy" ? <button type="button" className={buttonStyles.ghost} onClick={generateTopic}>Generate one</button> : null}
            </div>
          </div>
          <button type="submit" className={buttonStyles.primary} disabled={busy === "add" || !target.trim()}>{busy === "add" ? "Adding…" : "Add"}</button>
        </div>
        <label className="mt-3 flex max-w-sm flex-col gap-1.5 text-[14px] text-fg-2">
          Project (optional)
          <input value={project} onChange={(e) => setProject(e.target.value)} maxLength={120} placeholder="All projects" className={INPUT} />
        </label>
        {kind === "ntfy" ? <p className="mt-3 max-w-[70ch] text-[14px] leading-[1.55] text-fg-2">Anyone who knows this topic can read your alerts on ntfy.sh, so use a long random one and keep it private.</p> : null}
        <p className="mt-3 max-w-[70ch] text-[14px] leading-[1.55] text-fg-2">{KIND_HINT[kind]} Stored encrypted, shown masked, removable here.</p>
        {error ? <p className="mt-2 text-[14px] text-amber">{error}</p> : null}
      </form>
      ) : null}
    </section>
  );
}
