"use client";
/**
 * Jobs: every scheduled thing that checks in, whether it did, and where the alert goes when
 * it does not. Operate mode: one list, one form, plain words, the curl line one click away.
 */
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Empty, ErrorLine, List, PageHeader, SectionTitle, buttonStyles, surface } from "@/components/ui";
import { apiPost, apiSend, useApi } from "@/components/use-api";
import { JobSettingsFields, INPUT } from "./job-settings";
import { buildSettingsInput, buildSettingsPatch, describeProbeRule, emptyJobSettings, settingsFromJob, type JobSettingsValue, type Probe } from "./job-settings-lib";

type Job = {
  id: string;
  name: string;
  project: string | null;
  source: "manual" | "vercel";
  path: string | null;
  schedule: string | null;
  timeZone: string | null;
  owner: string | null;
  maxRunMinutes: number | null;
  minCount: number | null;
  probe: Probe | null;
  watched: boolean;
  evidenceState: "ok" | "not_readable" | "unavailable" | null;
  watchNote: string | null;
  periodMinutes: number;
  graceMinutes: number;
  status: "new" | "never_checked_in" | "up" | "late" | "down" | "paused" | "retired";
  lastPingAt: string | null;
  lastPingKind: string | null;
  lastNote: string | null;
  nextDueAt: string | null;
  missCount: number;
  pingUrl: string | null;
};
type Channel = { id: string; kind: "ntfy" | "slack" | "teams" | "email"; label: string; project: string | null; enabled: boolean; lastOkAt: string | null; lastError: string | null };

const PERIODS: [string, number][] = [["every 5 minutes", 5], ["every 15 minutes", 15], ["hourly", 60], ["every 6 hours", 360], ["daily", 1440], ["weekly", 10080]];
const KIND_LABEL: Record<Channel["kind"], string> = { ntfy: "Phone (ntfy)", slack: "Slack", teams: "Microsoft Teams", email: "Email" };
const KIND_HINT: Record<Channel["kind"], string> = {
  ntfy: "A topic name on ntfy.sh (install the ntfy app, subscribe to the same topic), or a full https topic URL on your own server.",
  slack: "An incoming webhook URL from hooks.slack.com (Slack app settings, Incoming Webhooks, Add New Webhook).",
  teams: "The URL of a Workflows “Post to a channel when a webhook request is received” flow, or a classic incoming webhook.",
  email: "An address. With no channel at all, alerts go to your account email.",
};
const STATUS_WORD: Record<Job["status"], string> = { new: "waiting for first check-in", never_checked_in: "never checked in", up: "on time", late: "late", down: "quiet", paused: "paused", retired: "retired" };
const STATUS_DOT: Record<Job["status"], string> = { new: "ring-1 ring-inset ring-line-3", never_checked_in: "bg-amber", up: "bg-accent", late: "bg-amber", down: "bg-red", paused: "bg-fg-3", retired: "bg-fg-3" };

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
function inWords(iso: string | null, now: number): string {
  if (!iso) return "";
  const m = Math.round((Date.parse(iso) - now) / 60_000);
  if (m <= 0) return "due now";
  if (m < 60) return `due in ${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `due in ${h} h`;
  return `due in ${Math.round(h / 24)} d`;
}
const period = (m: number) => PERIODS.find(([, v]) => v === m)?.[0] ?? (m % 60 === 0 ? `every ${m / 60} h` : `every ${m} min`);

export function JobsView() {
  const jobs = useApi<{ jobs: Job[] }>("/api/v1/checkins", { pollMs: () => 30_000 });
  const channels = useApi<{ channels: Channel[] }>("/api/v1/alert-channels");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [jobs.data]);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = jobs.data?.jobs ?? [];
  const chans = channels.data?.channels ?? [];

  return (
    <>
      <PageHeader title="Jobs" lede="Every scheduled thing you run checks in here. When one goes quiet, you hear on your phone, in Slack or Teams, or by email, and again when it is back.">
        <button type="button" className={list.length ? buttonStyles.secondary : buttonStyles.primary} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          Add a job
        </button>
      </PageHeader>
      {notice ? <p className="mb-4 text-[14px] text-amber">{notice}</p> : null}
      {jobs.error ? <ErrorLine message={jobs.error} /> : null}

      {adding ? (
        <AddJob
          onDone={async (msg) => {
            setAdding(false);
            if (msg) setNotice(msg);
            await jobs.reload();
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {jobs.data && !list.length && !adding ? (
        <div className="mb-12">
        <Empty title="No jobs yet." action={<button type="button" className={buttonStyles.primary} onClick={() => setAdding(true)}>Add a job</button>}>
          <p>Add one for each scheduled thing you run: a nightly build, a daily publish, a cron on a server. Each gets a link; the job hits it when it runs.</p>
        </Empty>
        </div>
      ) : null}

      {list.length ? (
        <section aria-labelledby="jobs-list" className="mb-12">
          <SectionTitle id="jobs-list" count={list.length}>Check-ins</SectionTitle>
          <List>
            {list.map((j) => (
              <JobRow key={j.id} j={j} now={now ?? 0} onChanged={() => jobs.reload()} onNotice={setNotice} />
            ))}
          </List>
        </section>
      ) : null}

      {jobs.data ? <Channels list={chans} loading={channels.loading} onChanged={() => channels.reload()} onNotice={setNotice} /> : null}
    </>
  );
}

function AddJob({ onDone, onClose }: { onDone: (msg: string | null) => void | Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [periodMinutes, setPeriod] = useState(1440);
  const [grace, setGrace] = useState(30);
  const [project, setProject] = useState("");
  const [settings, setSettings] = useState<JobSettingsValue>(() => emptyJobSettings());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ job: Job; curl: string } | null>(null);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) setSettings((current) => current.timeZone ? current : { ...current, timeZone: zone });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await apiPost<{ job: Job; curl: string }>("/api/v1/checkins", {
      name,
      periodMinutes,
      graceMinutes: grace,
      ...(project.trim() ? { project: project.trim() } : {}),
      ...buildSettingsInput(settings),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.error ?? "That job was not made. Try again.");
      return;
    }
    setMade(r.data);
  };

  if (made) {
    return (
      <section className={`${surface} mb-8 p-5 sm:p-6`}>
        <h2 className="text-[16px] font-medium text-fg">{made.job.name} is waiting for its first check-in.</h2>
        <p className="mt-1 max-w-[62ch] text-[14px] leading-[1.55] text-fg-2">Put this at the end of the job, after its own success check. One request, no key. The first time it runs, the job turns green here.</p>
        <div className="slab mt-3 flex items-start gap-1 rounded-lg py-2.5 pr-1.5 pl-3">
          <code className="min-w-0 flex-1 font-mono text-[13px] leading-[1.5] [overflow-wrap:anywhere] text-code">{made.curl}</code>
          <CopyButton value={made.curl} label="Copy the check-in command" />
        </div>
        <p className="mt-3 text-[14px] text-fg-2">
          Optional: <span className="font-mono text-fg">?status=start</span> at the beginning, <span className="font-mono text-fg">?status=fail</span> with a short note as the body when the job knows it failed.
        </p>
        <div className="mt-4">
          <button type="button" className={buttonStyles.secondary} onClick={() => onDone(null)}>Done</button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className={`${surface} mb-8 p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[16px] font-medium text-fg">Add a job</h2>
        <button type="button" className="-mt-1 inline-flex h-8 items-center rounded-lg px-2 text-[14px] text-fg-2 hover:text-fg" onClick={onClose}>Close</button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[14px] text-fg-2 sm:col-span-2">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="My Happenings 5pm update" className={INPUT} required />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
          Runs
          <select value={periodMinutes} onChange={(e) => setPeriod(Number(e.target.value))} className={INPUT}>
            {PERIODS.map(([label, v]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
          Grace, minutes
          <input type="number" min={1} max={10080} value={grace} onChange={(e) => setGrace(Number(e.target.value))} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] text-fg-2 sm:col-span-2">
          Project, optional
          <input value={project} onChange={(e) => setProject(e.target.value)} maxLength={120} placeholder="owner/repo" className={`${INPUT} font-mono`} />
        </label>
      </div>
      <details className="mt-4 border-t border-line-1 pt-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-fg sm:min-h-9">More options</summary>
        <div className="pt-3">
          <JobSettingsFields value={settings} onChange={setSettings} manual idPrefix="add-job" />
        </div>
      </details>
      {error ? <p className="mt-3 text-[14px] text-amber">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <button type="submit" className={buttonStyles.primary} disabled={busy || name.trim().length < 2}>{busy ? "Making…" : "Make the job"}</button>
      </div>
    </form>
  );
}

function JobRow({ j, now, onChanged, onNotice }: { j: Job; now: number; onChanged: () => void; onNotice: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const curl = `curl -fsS -m 10 --retry 3 "${j.pingUrl}"`;
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) onNotice(r.error ?? "That did not work. Try again.");
    onChanged();
  };
  const detail = j.status === "retired" ? "retired" : j.source === "vercel" && j.status === "paused" && !j.nextDueAt ? "not watched: schedule not understood" : j.status === "down" && j.lastPingKind === "fail" && j.missCount === 0 ? `run failed${j.lastNote ? `: ${j.lastNote}` : ""}` : j.status === "down" ? `${j.missCount} missed, last heard ${ago(j.lastPingAt, now)}` : j.status === "new" || j.status === "never_checked_in" ? "no check-in yet" : `last ${ago(j.lastPingAt, now)}${j.nextDueAt && j.status !== "paused" ? `, ${inWords(j.nextDueAt, now)}` : ""}`;
  const statusWord = j.watchNote ?? STATUS_WORD[j.status];
  const statusDisplay = j.evidenceState === "not_readable" && j.watchNote ? <>{j.watchNote.split("Connections")[0]}<a href="/app/connections?vercel=open#vercel" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">Connections</a>{j.watchNote.split("Connections")[1]}</> : statusWord;
  return (
    <li className={`border-b border-line-1 px-4 py-3 last:border-b-0 sm:px-6${j.status === "retired" ? " opacity-55" : ""}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${STATUS_DOT[j.status]}`} />
        <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{j.name}</span>
        <span className="hidden max-w-[60ch] text-[14px] text-fg-2 sm:inline">{statusDisplay}</span>
        <button type="button" className={buttonStyles.ghost} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Less" : "More"}</button>
      </div>
      <p className="mt-0.5 pl-[19px] text-[14px] text-fg-2 sm:hidden">{statusDisplay}</p>
      <p className="mt-0.5 pl-[19px] text-[12px] text-fg-3">
        {period(j.periodMinutes)}, grace {j.graceMinutes} min · {detail}
        {j.project ? <> · <span className="font-mono">{j.project}</span></> : null}
      </p>
      {j.status === "never_checked_in" ? <p className="mt-1 pl-[19px] text-[14px] text-fg-2">No check-in since you added this, and its first run was due. Retire it if the job is gone.</p> : null}
      {j.source === "vercel" ? <><p className="mt-0.5 pl-[19px] text-[12px] text-fg-3">Vercel schedule · <span className="font-mono">{j.path} · {j.schedule}</span></p>{j.watched ? <p className="mt-0.5 pl-[19px] text-[12px] text-fg-3">Watched from Vercel&apos;s request history, no code change</p> : null}</> : null}
      {open ? (
        <div className="mt-3 pl-[19px]">
          <JobSettingsSummary job={j} />
          {j.source === "manual" || j.watchNote ? <div className="slab flex items-start gap-1 rounded-lg py-2.5 pr-1.5 pl-3">
            <code className="min-w-0 flex-1 font-mono text-[13px] leading-[1.5] [overflow-wrap:anywhere] text-code">{curl}</code>
            <CopyButton value={curl} label={`Copy the check-in command for ${j.name}`} />
          </div> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonStyles.ghost} onClick={() => setEditing((value) => !value)} aria-expanded={editing}>Edit settings</button>
            {j.source === "manual" && j.status !== "retired" ? <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={() => act(() => apiSend("PATCH", `/api/v1/checkins/${j.id}`, { paused: j.status !== "paused" }))}>
              {j.status === "paused" ? "Resume" : "Pause"}
            </button> : null}
            {j.status !== "retired" ? (
              <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={() => act(() => apiSend("PATCH", `/api/v1/checkins/${j.id}`, { retired: true }))}>Retire</button>
            ) : confirming ? (
              <>
                <button type="button" className={buttonStyles.ghost} onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className={`${buttonStyles.danger} text-red`} disabled={busy} onClick={() => act(() => apiSend("DELETE", `/api/v1/checkins/${j.id}`))}>Delete this job</button>
              </>
            ) : (
              <>
                <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={() => act(() => apiSend("PATCH", `/api/v1/checkins/${j.id}`, { retired: false }))}>Bring back</button>
                <button type="button" className={buttonStyles.quietDanger} onClick={() => setConfirming(true)}>Delete</button>
              </>
            )}
          </div>
          {editing ? <EditSettings job={j} onClose={() => setEditing(false)} onChanged={onChanged} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function JobSettingsSummary({ job }: { job: Job }) {
  const lines = [
    job.schedule ? `Runs ${job.schedule}${job.timeZone ? ` (${job.timeZone})` : ""}` : null,
    job.probe ? `Checks ${job.probe.url}: ${job.probe.expect.map(describeProbeRule).join(", ")}` : null,
    job.owner ? `Owner: ${job.owner}` : null,
    job.maxRunMinutes !== null ? `Longest run: ${job.maxRunMinutes} minutes` : null,
    job.minCount !== null ? `Fewest items per run: ${job.minCount}` : null,
  ].filter((line): line is string => Boolean(line));
  if (!lines.length) return <p className="mb-3 text-[14px] text-fg-2">No extra settings.</p>;
  return <ul className="mb-3 space-y-1 text-[14px] text-fg-2">{lines.map((line) => <li key={line}>{line}</li>)}</ul>;
}

function EditSettings({ job, onClose, onChanged }: { job: Job; onClose: () => void; onChanged: () => void }) {
  const [settings, setSettings] = useState<JobSettingsValue>(() => settingsFromJob(job));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const patch = buildSettingsPatch(job, settings, job.source === "manual");
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiSend<{ job: Job }>("PATCH", `/api/v1/checkins/${job.id}`, patch);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Those settings were not saved. Try again.");
      return;
    }
    onClose();
    onChanged();
  };
  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-line-2 p-4 sm:p-5">
      <JobSettingsFields value={settings} onChange={setSettings} manual={job.source === "manual"} idPrefix={`edit-${job.id}`} />
      {job.source === "vercel" ? <p className="mt-3 text-[14px] text-fg-2">Vercel sets this job's schedule. Result checks work on jobs you add yourself.</p> : null}
      {error ? <p className="mt-3 text-[14px] text-amber">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className={buttonStyles.primary} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        <button type="button" className={buttonStyles.ghost} onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Channels({ list, loading, onChanged, onNotice }: { list: Channel[]; loading: boolean; onChanged: () => void; onNotice: (m: string) => void }) {
  const [kind, setKind] = useState<Channel["kind"]>("ntfy");
  const [target, setTarget] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

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
      <SectionTitle id="channels-title" count={list.length || undefined}>Where alerts go</SectionTitle>
      {!list.length && !loading ? <p className={`mb-4 px-4 py-4 text-[14px] text-fg-2 sm:px-6 ${surface}`}>Nothing set, so alerts go to your account email. Add your phone or a channel below.</p> : null}
      {list.length ? (
        <List>
          {list.map((c) => (
            <li key={c.id} className="border-b border-line-1 px-4 py-3 last:border-b-0 sm:flex sm:items-center sm:gap-x-4 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${c.lastError ? "bg-amber" : c.lastOkAt ? "bg-accent" : "ring-1 ring-inset ring-line-3"}`} />
                <span className="shrink-0 text-[14px] text-fg">{KIND_LABEL[c.kind]}</span>
                <span className="min-w-0 truncate font-mono text-[13px] text-fg-2">{c.label}</span>
                {c.project ? <span className="min-w-0 truncate font-mono text-[12px] text-fg-2">Project: {c.project}</span> : null}
              </div>
              <div className="mt-2 flex items-center gap-2 pl-[19px] sm:mt-0 sm:pl-0">
                {c.lastError ? <span className="mr-auto text-[12px] text-amber">{c.lastError}</span> : sent === c.id ? <span className="mr-auto text-[12px] text-fg-2">sent</span> : null}
                <button type="button" className={buttonStyles.ghost} disabled={busy === c.id} onClick={() => test(c.id)}>Send a test</button>
                <button type="button" className={buttonStyles.quietDanger} disabled={busy === c.id} onClick={() => remove(c.id)}>Remove</button>
              </div>
            </li>
          ))}
        </List>
      ) : null}
      <form onSubmit={add} className={`${surface} mt-4 p-5 sm:p-6`}>
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
    </section>
  );
}
