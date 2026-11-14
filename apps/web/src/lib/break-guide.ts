/**
 * What a break is, in plain words: what happened, the one thing to do, who has it, and the words
 * for a coding agent. Pure, so Today, Projects, Schedules and the tests share one table.
 *
 * Routing is stated as the code does it, never more. Failed deploys and jobs that failed, went
 * quiet or never checked in are in the agent inbox (GET /api/v1/incidents): the session hook reads
 * it at session start, and the fixer script claims new unclaimed ones every 5 minutes. A site down
 * or a run of server errors alerts the owner but is not in that inbox. Check findings are
 * suggestions: nothing sends them to an agent until the owner hands one over.
 */

export type BreakKind = "deploy_failed" | "job_failed" | "job_quiet" | "job_never" | "site_down" | "server_errors" | "check";

/** The chart's kinds, plus what the job says now, mapped to one break kind. */
export function breakKind(c: { kind: "deploy" | "job" | "site" | "server_errors" | "check"; what: string }, jobStatus?: string | null): BreakKind {
  if (c.kind === "deploy") return "deploy_failed";
  if (c.kind === "site") return "site_down";
  if (c.kind === "server_errors") return "server_errors";
  if (c.kind === "check") return "check";
  if (jobStatus === "never_checked_in") return "job_never";
  return /run failed$/.test(c.what) ? "job_failed" : "job_quiet";
}

const TODO: Record<BreakKind, string> = {
  deploy_failed: "Fix the build error and push. The next deploy closes it.",
  job_failed: "Read the job's last note, fix the cause, and let the next run pass.",
  job_quiet: "Check the job still runs on schedule. If it is gone, retire it here.",
  job_never: "Add the check-in line to the job, or retire it if the job is gone.",
  site_down: "Open the site. If it is down, roll back to the last good deploy on your host.",
  server_errors: "Open the host's logs for the failing route and fix the error.",
  check: "Open the suggestion and apply the fix it names, or dismiss it if it does not matter.",
};

/** The one thing to do, by kind. */
export function whatToDo(kind: BreakKind): string {
  return TODO[kind];
}

/** "6 min ago", "3 h ago", "2 d ago": short and dash free. */
export function sinceWords(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const stamp = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/**
 * What happened, from the real data: the build log line, the job's last note, or when a quiet
 * job last checked in and when it was due. Falls back to the chart's own words.
 */
export function whatHappened(
  b: { kind: BreakKind; what: string; cause?: string | null; note?: string | null; lastCheckIn?: string | null; dueAt?: string | null },
  now: number,
): string {
  if (b.kind === "deploy_failed") return b.cause ? `The build log says: ${b.cause}` : "The deploy failed. The host gave no log line.";
  if (b.kind === "job_failed") return b.note ? `The job reported a failed run: ${b.note}` : "The job reported a failed run with no note.";
  if (b.kind === "job_quiet") {
    if (!b.lastCheckIn) return "The job went quiet. It has never checked in.";
    return `Went quiet: last check-in ${sinceWords(b.lastCheckIn, now)}${b.dueAt ? `, was due ${sinceWords(b.dueAt, now)}` : ""}.`;
  }
  if (b.kind === "job_never") return "The job has never checked in, and its first run was due.";
  if (b.kind === "site_down") return "The production site failed two checks in a row.";
  if (b.kind === "server_errors") return "The site is answering with server errors.";
  return b.what;
}

/** Who holds a break right now, from the live claims. */
export type ClaimLike = { project: string; agent: string | null; apiKeyId: string | null; at: string };

/** One project named two ways ("owner/repo" and "repo") is the same project. */
export const sameProject = (a: string, b: string) => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`) || x.split("/").pop() === y.split("/").pop();
};

/** The live claim on a project, matching "owner/repo" and "repo" alike. Browser safe, unlike lib/claims. */
export function claimOn<C extends ClaimLike>(claims: C[], project: string | null): C | null {
  if (!project) return null;
  return claims.find((c) => sameProject(c.project, project)) ?? null;
}

/**
 * Where a break stands with the owner's agents, in one line. `sent` is true only for kinds the
 * agent inbox carries; a claim names who is on it and since when.
 */
export function routingStatus(kind: BreakKind, claim: ClaimLike | null, now: number): { sent: boolean; text: string } {
  if (kind === "check") return { sent: false, text: "Not sent to your agent: suggestions wait for you." };
  if (kind === "site_down" || kind === "server_errors") return { sent: false, text: "You were alerted. Your agents are not told about this kind yet." };
  if (!claim) return { sent: true, text: "Sent to your agents. Nobody has picked it up yet." };
  const who = !claim.apiKeyId ? "You claimed it from the web app" : claim.agent && /fixer/i.test(claim.agent) ? "Your fixer claimed it" : claim.agent ? `${claim.agent} claimed it` : "An agent claimed it";
  return { sent: true, text: `Sent to your agents. ${who} ${sinceWords(claim.at, now)}.` };
}

export const CONFIRM_URL = "https://spookyparticles.com/api/v1/incidents/confirm";

/**
 * A short prompt for the owner's coding agent: the project, what broke, the cause, fix it through
 * a pull request, then ask Spooky to confirm on production.
 */
export function breakPrompt(b: { project: string; what: string; cause?: string | null; link?: string | null; at?: string | null }): string {
  return [
    `Spooky Particles says ${b.project} is broken: ${b.what.replace(/[.\s]+$/, "")}${b.at ? ` (since ${stamp(b.at)})` : ""}.`,
    b.cause ? `Cause: ${b.cause}` : null,
    b.link ? `Source: ${b.link}` : null,
    "",
    "Please fix the cause through a pull request. Once it is merged and deployed, confirm with Spooky:",
    `curl -s -X POST -H "Authorization: Bearer $SPOOKY_API_KEY" "${CONFIRM_URL}?project=${encodeURIComponent(b.project)}&format=text"`,
    "Say it is fixed only when Spooky answers fixed. If it should not be fixed, change nothing and tell me why in one line.",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

/**
 * Why the chart's "Open" and Today's "Broken now" differ, in words. The chart counts every open
 * catch: check findings too, and each failure of the same deploy. Broken now counts a project's
 * break once and leaves suggestions out. Returns null when there is nothing open.
 */
export function openSplit(open: { kind: string; project: string | null; status: string }[]): { open: number; broken: number; repeats: number; checks: number; words: string } | null {
  const list = open.filter((c) => c.status === "open");
  if (!list.length) return null;
  const checks = list.filter((c) => c.kind === "check").length;
  const breaks = list.filter((c) => c.kind !== "check");
  const broken = new Set(breaks.map((c) => `${c.kind}|${(c.project ?? "").toLowerCase()}`)).size;
  const repeats = breaks.length - broken;
  const parts = [
    `${broken} broken now`,
    repeats ? `${repeats} more ${repeats === 1 ? "failure" : "failures"} of the same ${repeats === 1 ? "break" : "breaks"}` : null,
    checks ? `${checks} check ${checks === 1 ? "finding" : "findings"} waiting for you` : null,
  ].filter(Boolean);
  return { open: list.length, broken, repeats, checks, words: parts.length > 1 ? `${list.length} open: ${parts.join(", ")}.` : `${list.length} open, all broken now.` };
}
