/** Start a workflow in a repo through the user's connected GitHub installation. No token enters a result, event, or log. */
import { getInstallationToken } from "@/lib/connections";
import { locateRepo } from "@/lib/github-refresh";

export const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
export type DispatchResult = { ok: boolean; reason?: string };

export function dispatchReason(status: number, workflow: string): string {
  if (status === 403) return "Spooky needs permission to start Actions in this repo (Actions: write on the Spooky GitHub app).";
  if (status === 404) return `No .github/workflows/${workflow} in this repo's default branch, or Spooky can't see the repo.`;
  return `http ${status}`;
}

export async function dispatchWorkflow(userId: string, repo: string, workflow: string, inputs: Record<string, string>): Promise<DispatchResult> {
  if (!REPO.test(repo)) return { ok: false, reason: "Invalid GitHub repository." };
  try {
    const found = await locateRepo(userId, repo);
    if (!found) return { ok: false, reason: "This repo is not connected to Spooky." };
    const token = await getInstallationToken(found.connectionId);
    const [owner, name] = repo.split("/");
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "spooky-particles" };
    const options = { headers, redirect: "error" as const, signal: AbortSignal.timeout(8_000) };
    const details = await fetch(url, options);
    if (!details.ok) return { ok: false, reason: dispatchReason(details.status, workflow) };
    const data = await details.json() as { default_branch?: unknown };
    if (typeof data.default_branch !== "string" || !data.default_branch) return { ok: false, reason: "GitHub did not return a default branch." };
    const dispatched = await fetch(`${url}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      ...options,
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: data.default_branch, inputs }),
    });
    return dispatched.status === 204 ? { ok: true } : { ok: false, reason: dispatchReason(dispatched.status, workflow) };
  } catch {
    return { ok: false, reason: "GitHub request failed." };
  }
}
