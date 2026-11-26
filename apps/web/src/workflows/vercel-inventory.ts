/**
 * Vercel inventory for a pasted token: every scope the token reads, every
 * project in it, the newest deployments and the domains, into the graph. Ten
 * projects per step, so a failure retries only that batch. Read-only.
 */
import { failRun } from "./steps/gmail";
import { runErrorMessage } from "./steps/run-error";
import { ensureVercelAccounts, listScopeProjects, markVercelSynced, syncVercelBilling, syncVercelProjects } from "./steps/vercel";

/** Projects per step. Each step is billed, so the watcher starts this only after a change or hourly. */
const BATCH = 10;

export async function vercelInventory(input: { connectionId: string; syncRunId: string; billing?: boolean }) {
  "use workflow";
  const { connectionId, syncRunId } = input;
  const billing = input.billing ?? true;
  let projects = 0;
  let truncated = false;
  try {
    const { userId, accounts, fingerprints } = await ensureVercelAccounts(connectionId);
    for (const { scope, nodeId } of accounts) {
      const list = await listScopeProjects(connectionId, nodeId, scope);
      truncated = truncated || list.truncated;
      let skipSchedules = list.skipSchedules;
      let skipEnvList = list.skipEnvList;
      let schedulesRead = list.schedulesRead;
      let envListRead = list.envListRead;
      for (let i = 0; i < list.projects.length; i += BATCH) {
        const synced = await syncVercelProjects({ connectionId, userId, accountNodeId: nodeId, scope, projects: list.projects.slice(i, i + BATCH), registrations: list.registrations, syncRunId, scannedBefore: projects, skipSchedules, skipEnvList, schedulesRead, envListRead });
        projects += synced.count;
        skipSchedules = synced.skipSchedules;
        skipEnvList = synced.skipEnvList;
        schedulesRead = synced.schedulesRead;
        envListRead = synced.envListRead;
      }
      // After the projects, so a charge tagged with a project can link to it. Billing moves daily, so the 5-minute watcher reads it once an hour.
      if (billing) await syncVercelBilling({ connectionId, userId, accountNodeId: nodeId, scope });
    }
    await markVercelSynced(connectionId, syncRunId, projects, truncated, accounts, fingerprints);
    return { projects, truncated };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "vercel inventory failed"));
    throw err;
  }
}
