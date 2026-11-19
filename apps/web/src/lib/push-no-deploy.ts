/** A default-branch commit older than the existing stale-push window with no Vercel build. */
export const STALE_PUSH_MS = 20 * 60_000;

export type PushHead = { sha: string; at: string };
export type PushDeployment = { sha: string | null; at: string | null };
export type PushFinding = PushHead & { minutesSince: number; lastDeployAt: string | null };
export const pushAlertKey = (project: string, sha: string) => `push_not_deployed:${project.toLowerCase()}:${sha.toLowerCase()}`;

/** Pure: every Vercel environment and state counts, including canceled and failed builds. */
export function pushNoDeploy(input: {
  head: PushHead | null;
  linkedToVercel: boolean;
  archived: boolean;
  deployments: PushDeployment[];
  nowMs: number;
}): PushFinding | null {
  const { head, linkedToVercel, archived, deployments, nowMs } = input;
  if (!head?.sha || !linkedToVercel || archived) return null;
  const headMs = Date.parse(head.at);
  if (!Number.isFinite(headMs) || nowMs - headMs <= STALE_PUSH_MS) return null;
  const sha = head.sha.toLowerCase();
  if (deployments.some((d) => {
    const deployedSha = d.sha?.toLowerCase();
    return deployedSha ? sha.startsWith(deployedSha) || deployedSha.startsWith(sha) : false;
  })) return null;
  const newest = deployments.map((d) => d.at).filter((at): at is string => typeof at === "string" && Number.isFinite(Date.parse(at))).sort().at(-1) ?? null;
  if (newest && headMs <= Date.parse(newest)) return null;
  return { sha: head.sha, at: head.at, minutesSince: Math.floor((nowMs - headMs) / 60_000), lastDeployAt: newest };
}
