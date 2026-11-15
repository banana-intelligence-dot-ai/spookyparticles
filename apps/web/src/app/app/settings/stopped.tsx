"use client";
/**
 * Not watched: the projects (or kinds of notice on them) the owner stopped, and the notices they
 * cleared. Every row can be turned back on. Nothing here deletes: stopping and clearing are
 * events with an audit line, and History keeps what already happened. Uses /api/v1/mutes and
 * /api/v1/notices/clear, the same calls an agent with a write key makes.
 */
import { useState } from "react";
import { SectionTitle, buttonStyles } from "@/components/ui";
import { apiSend, useApi } from "@/components/use-api";
import type { Cleared } from "@/lib/ignores";
import type { Mute } from "@/lib/mutes";
import { absoluteTime } from "../data-model";
import { ago, type ProjectsReport } from "../project-model";

export const KIND_LABEL: Record<string, string> = {
  all: "Everything",
  deploy: "Failed deploys",
  job: "Scheduled jobs",
  site: "Site down",
  server_errors: "Server errors",
  check: "Check suggestions",
};

type Result = Promise<string | null>;
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : (r.error ?? "That didn't save. Try again."));

export function Stopped({ now }: { now: number }) {
  const mutes = useApi<{ mutes: Mute[] }>("/api/v1/mutes");
  const cleared = useApi<{ cleared: Cleared[] }>("/api/v1/notices/clear");
  const projects = useApi<ProjectsReport>("/api/v1/projects");
  if (!mutes.data || !cleared.data) return null;
  return (
    <StoppedList
      mutes={mutes.data.mutes}
      cleared={cleared.data.cleared}
      projects={(projects.data?.projects ?? []).map((p) => p.name)}
      now={now}
      onStop={async (project, kind) => {
        const r = await apiSend("POST", "/api/v1/mutes", { project, kind });
        await mutes.reload();
        return err(r);
      }}
      onResume={async (m) => {
        const r = await apiSend("DELETE", "/api/v1/mutes", { project: m.project, kind: m.kind ?? "all" });
        await mutes.reload();
        return err(r);
      }}
      onRestore={async (c) => {
        const r = await apiSend("DELETE", "/api/v1/notices/clear", { keys: [c.key], project: c.project ?? "", what: c.what ?? undefined });
        await cleared.reload();
        return err(r);
      }}
    />
  );
}

const row = "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-1 py-3";
const field = "h-11 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9";

/** Presentational, so the dev preview draws it against fixtures. */
export function StoppedList({
  mutes,
  cleared,
  projects,
  now,
  onStop,
  onResume,
  onRestore,
}: {
  mutes: Mute[];
  cleared: Cleared[];
  projects: string[];
  now: number;
  onStop: (project: string, kind: string) => Result;
  onResume: (m: Mute) => Result;
  onRestore: (c: Cleared) => Result;
}) {
  const [project, setProject] = useState("");
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allCleared, setAllCleared] = useState(false);
  const [adding, setAdding] = useState(false);
  const run = async (id: string, fn: () => Result) => {
    setBusy(id);
    setError(await fn());
    setBusy(null);
  };
  const shownCleared = allCleared ? cleared : cleared.slice(0, 5);

  return (
    <section id="stopped" aria-labelledby="stopped-title" className="mt-14 scroll-mt-8">
      <SectionTitle
        id="stopped-title"
        count={mutes.length || undefined}
        action={
          <button type="button" className={buttonStyles.ghost} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Stop watching a project"}
          </button>
        }
      >
        Not watched
      </SectionTitle>
      <p className="-mt-2 mb-4 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
        A project that ended, or a notice you expect. A stopped project sends no pings and puts nothing on Now or in your agent&apos;s inbox. Nothing is deleted, and you can turn it back on here.
      </p>

      {mutes.length ? (
        <ul className="border-t border-line-1">
          {mutes.map((m) => (
            <li key={m.key} className={row}>
              <span className="min-w-0 flex-1 basis-full sm:basis-0">
                <span className="block truncate font-mono text-[14px] text-fg">{m.project}</span>
                <span className="block text-[13px] text-fg-2">
                  {KIND_LABEL[m.kind ?? "all"]}
                  {" · stopped "}
                  <span title={absoluteTime(m.at)}>{ago(m.at, now)}</span>
                  {m.by && m.by !== "you" ? ` by ${m.by}` : ""}
                </span>
              </span>
              <button type="button" className={buttonStyles.secondary} disabled={busy === m.key} onClick={() => void run(m.key, () => onResume(m))}>
                {busy === m.key ? "Turning on…" : "Watch again"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line-1 py-3 text-[14px] text-fg-3">Everything is watched.</p>
      )}

      {adding ? (
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!project.trim()) return;
          void run("new", async () => {
            const r = await onStop(project.trim(), kind);
            if (!r) setProject("");
            return r;
          });
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[12px] text-fg-2">Project</span>
          <input list="stop-projects" value={project} onChange={(e) => setProject(e.target.value)} placeholder="owner/repo" autoComplete="off" spellCheck={false} className={`${field} font-mono`} />
          <datalist id="stop-projects">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-fg-2">What to stop</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} pr-8`}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${buttonStyles.secondary} sm:h-9!`} disabled={busy === "new" || !project.trim()}>
          {busy === "new" ? "Stopping…" : "Stop watching"}
        </button>
      </form>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-red">{error}</p> : null}

      {cleared.length ? (
        <>
          <h3 className="mt-10 mb-2 flex items-baseline gap-3 text-[16px] font-medium text-fg">
            Cleared notices
            <span className="num text-[14px] font-normal text-fg-2">{cleared.length}</span>
          </h3>
          <ul className="border-t border-line-1">
            {shownCleared.map((c) => (
              <li key={c.key} className={row}>
                <span className="min-w-0 flex-1 basis-full sm:basis-0">
                  <span className="block text-[14px] text-pretty text-fg">{c.what ?? "A notice"}</span>
                  <span className="block text-[13px] text-fg-2">
                    {c.project ? <span className="font-mono">{c.project}</span> : null}
                    {c.project ? " · " : ""}
                    cleared <span title={absoluteTime(c.at)}>{ago(c.at, now)}</span>
                    {c.by && c.by !== "you" ? ` by ${c.by}` : ""}
                  </span>
                </span>
                <button type="button" className={buttonStyles.ghost} disabled={busy === c.key} onClick={() => void run(c.key, () => onRestore(c))}>
                  {busy === c.key ? "Restoring…" : "Restore"}
                </button>
              </li>
            ))}
          </ul>
          {cleared.length > 5 ? (
            <button type="button" aria-expanded={allCleared} onClick={() => setAllCleared((v) => !v)} className="mt-1 inline-flex min-h-11 items-center text-[14px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg">
              {allCleared ? "Show fewer" : `Show all ${cleared.length}`}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
