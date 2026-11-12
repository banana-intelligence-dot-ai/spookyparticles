/**
 * Vercel inventory for a pasted token: every scope the token reads, every
 * project in it, the newest deployments and the domains, into the graph. Ten
 * projects per step, so a failure retries only that batch. Read-only.
 */
import { failRun } from "./steps/gmail";
import { runErrorMessage } from "./steps/run-error";
import { ensureVercelAccounts, listScopeProjects, markVercelSynced, syncVercelBilling, syncVercelProjects } from "./steps/vercel";

/** Projects per step. Each step is billed, and this runs every 5 minutes. */
const BATCH = 10;

export async function vercelInventory(input: { connectionId: string; syncRunId: string; billing?: boolean }) {
  "use workflow";
  const { connectionId, syncRunId } = input;
  const billing = input.billing ?? true;
  let projects = 0;
  let truncated = false;
  try {
    const { userId, accounts } = await ensureVercelAccounts(connectionId);
    for (const { scope, nodeId } of accounts) {
      const list = await listScopeProjects(connectionId, scope);
      truncated = truncated || list.truncated;
      for (let i = 0; i < list.projects.length; i += BATCH) {
        projects += await syncVercelProjects({ connectionId, userId, accountNodeId: nodeId, scope, projects: list.projects.slice(i, i + BATCH), registrations: list.registrations, syncRunId, scannedBefore: projects });
      }
      // After the projects, so a charge tagged with a project can link to it. Billing moves daily, so the 5-minute watcher reads it once an hour.
      if (billing) await syncVercelBilling({ connectionId, userId, accountNodeId: nodeId, scope });
    }
    await markVercelSynced(connectionId, syncRunId, projects, truncated);
    return { projects, truncated };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "vercel inventory failed"));
    throw err;
  }
}
