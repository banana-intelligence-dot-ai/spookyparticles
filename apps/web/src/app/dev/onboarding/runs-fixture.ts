/** Dev preview only: two weeks of check-ins for the Schedules chart. Not real data. */
import { runWindow, RUN_DAYS, RUN_HOURS, type Miss, type RunBin, type RunHistory, type RunRow } from "@/lib/run-history";
import { NOW } from "./fixtures";

const HOUR = 3_600_000;
const { since } = runWindow(new Date(NOW));
const hourAt = (daysAgo: number) => Math.floor((NOW - daysAgo * 86_400_000 - since) / HOUR);
const iso = (daysAgo: number, plusMin = 0) => new Date(NOW - daysAgo * 86_400_000 + plusMin * 60_000).toISOString();

/** A run every `everyH` hours at `offset`, skipping hours inside a miss, with fails at given hours. */
function bins(everyH: number, offset: number, gaps: [number, number][] = [], fails: number[] = []): RunBin[] {
  const out: RunBin[] = [];
  for (let i = offset; i < RUN_HOURS - 1; i += everyH) {
    if (gaps.some(([a, b]) => i >= a && i < b)) continue;
    const per = everyH === 1 ? 12 : 1;
    out.push(fails.includes(i) ? [i, 0, 1] : [i, per, 0]);
  }
  return out;
}
const miss = (kind: Miss["kind"], fromDaysAgo: number, backMin: number | null, missed = 1): Miss => ({
  kind, from: iso(fromDaysAgo), alertedAt: iso(fromDaysAgo, 6), backAt: backMin === null ? null : iso(fromDaysAgo, backMin), missed,
});
const row = (id: string, name: string, project: string, b: RunBin[], misses: Miss[], status = "up", periodMinutes = 1440): RunRow => ({
  id, name, project, status, periodMinutes, bins: b, misses, runs: b.reduce((n, x) => n + x[1], 0), fails: b.reduce((n, x) => n + x[2], 0),
});

const jobs: RunRow[] = [
  row("r1", "nightly-publish", "n8peace/news-factory", bins(24, 6, [[hourAt(0.3), RUN_HOURS]]), [miss("quiet", 0.3, null)], "down"),
  row("r2", "morning-audio", "n8peace/daystart", bins(24, 13, [], [hourAt(11)]), [miss("failed", 11, 95, 0)]),
  row("r3", "/api/cron/watch", "n8peace/spooky-particles", bins(1, 0, [[hourAt(6.2), hourAt(6.2) + 3]]), [miss("quiet", 6.2, 170, 2)], "up", 5),
  row("r4", "lead-chart", "n8peace/artifact-news", bins(24, 16, [[hourAt(9), hourAt(9) + 20]]), [miss("quiet", 9, 22 * 60)]),
  row("r5", "update-check", "n8peace/my-happenings", bins(6, 2), []),
  row("r6", "weekly-digest", "n8peace/natepeace", bins(168, 40), [], "up", 10080),
  row("r7", "backup-db", "plain-ballot", bins(24, 9), []),
];

export const RUNS: RunHistory = {
  windowDays: RUN_DAYS,
  since: new Date(since).toISOString(),
  checkedAt: new Date(NOW).toISOString(),
  jobs,
  summary: { runs: jobs.reduce((n, r) => n + r.runs, 0), caught: 4, back: 3, medianBackMinutes: 170 },
};
