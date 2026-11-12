/**
 * GitHub inventory for a GitHub App installation: the repos the user picked,
 * their deployments, environments and URLs into the graph. One step per repo so
 * a failure retries only that repo. Read-only.
 *
 * Rate limits: when GitHub reports fewer than RATE_FLOOR requests left, the run
 * stops, records the last repo it finished, and the next sync resumes there.
 */
import { failRun } from "./steps/gmail";
import { runErrorMessage } from "./steps/run-error";
import {
  ensureAccountNode,
  listRepos,
  markGithubSynced,
  pauseGithubRun,
  setGithubProgress,
  syncRepo,
} from "./steps/github";

/** Stop condition: at most this many repo pages (100 repos each). */
const MAX_PAGES = 20;
/** Leave this much of the installation's hourly budget unused. */
const RATE_FLOOR = 100;
/** Write progress every this many repos. */
const PROGRESS_EVERY = 5;

export async function githubInventory(input: { connectionId: string; syncRunId: string; resumeAfterRepoId?: number | null }) {
  "use workflow";
  const { connectionId, syncRunId } = input;
  const resumeAfter = input.resumeAfterRepoId ?? null;
  let repos = 0;
  try {
    const { userId, accountNodeId } = await ensureAccountNode(connectionId);
    const list = await listRepos(connectionId, MAX_PAGES);
    const todo = resumeAfter === null ? list.repos : list.repos.filter((r) => r.id > resumeAfter);
    repos = list.repos.length - todo.length;

    let lastDone: number | null = resumeAfter;
    let rateRemaining = list.rateRemaining;
    for (const repo of todo) {
      if (rateRemaining !== null && rateRemaining < RATE_FLOOR) {
        await pauseGithubRun(syncRunId, repos, lastDone === null ? null : String(lastDone));
        return { repos, paused: true };
      }
      const r = await syncRepo({ connectionId, userId, accountNodeId, repo });
      rateRemaining = r.rateRemaining ?? rateRemaining;
      repos += 1;
      lastDone = repo.id;
      if (repos % PROGRESS_EVERY === 0) await setGithubProgress(syncRunId, repos);
    }
    await markGithubSynced(connectionId, syncRunId, repos);
    return { repos, paused: false, truncated: list.truncated };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "github inventory failed"));
    throw err;
  }
}
