/**
 * GitHub inventory for a GitHub App installation: the repos the user picked,
 * their deployments, environments and URLs into the graph. Repos go BATCH at a
 * time per step: most runs change nothing, and each step is a billed Workflow
 * event. A failure retries only its batch. Read-only.
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
  syncRepoBatch,
} from "./steps/github";

/** Stop condition: at most this many repo pages (100 repos each). */
const MAX_PAGES = 20;
/** Leave this much of the installation's hourly budget unused. */
const RATE_FLOOR = 100;
/** Repos per step; progress is written after each batch. */
const BATCH = 10;

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
    for (let i = 0; i < todo.length; i += BATCH) {
      const b = await syncRepoBatch({ connectionId, userId, accountNodeId, repos: todo.slice(i, i + BATCH), rateRemaining, rateFloor: RATE_FLOOR });
      rateRemaining = b.rateRemaining;
      repos += b.done;
      lastDone = b.lastDone ?? lastDone;
      if (b.paused) {
        await pauseGithubRun(syncRunId, repos, lastDone === null ? null : String(lastDone));
        return { repos, paused: true };
      }
      if (i + BATCH < todo.length) await setGithubProgress(syncRunId, repos);
    }
    await markGithubSynced(connectionId, syncRunId, repos);
    return { repos, paused: false, truncated: list.truncated };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "github inventory failed"));
    throw err;
  }
}
