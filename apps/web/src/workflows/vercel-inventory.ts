/**
 * Vercel inventory for a pasted token: every scope the token reads, every
 * project in it, the newest deployments and the domains, into the graph. One
 * step per project so a failure retries only that project. Read-only.
 */
import { failRun } from "./steps/gmail";
import { runErrorMessage } from "./steps/run-error";
import { ensureVercelAccounts, listScopeProjects, markVercelSynced, setVercelProgress, syncVercelBilling, syncVercelProject } from "./steps/vercel";

/** Write progress every this many projects. */
const PROGRESS_EVERY = 5;

export async function vercelInventory(input: { connectionId: string; syncRunId: string }) {
  "use workflow";
  const { connectionId, syncRunId } = input;
  let projects = 0;
  let truncated = false;
  try {
    const { userId, accounts } = await ensureVercelAccounts(connectionId);
    for (const { scope, nodeId } of accounts) {
      const list = await listScopeProjects(connectionId, scope);
      truncated = truncated || list.truncated;
      for (const project of list.projects) {
        await syncVercelProject({ connectionId, userId, accountNodeId: nodeId, scope, project, registrations: list.registrations });
        projects += 1;
        if (projects % PROGRESS_EVERY === 0) await setVercelProgress(syncRunId, projects);
      }
      // After the projects, so a charge tagged with a project can link to it.
      await syncVercelBilling({ connectionId, userId, accountNodeId: nodeId, scope });
    }
    await markVercelSynced(connectionId, syncRunId, projects, truncated);
    return { projects, truncated };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "vercel inventory failed"));
    throw err;
  }
}
