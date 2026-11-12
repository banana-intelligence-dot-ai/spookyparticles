/** The same current deployment incidents for REST and MCP readers. */
import { refreshRepoQuietly } from "./github-refresh";
import { failedDeployments } from "./projects";
import { resyncHostsQuietlyFor } from "./sync";

const WINDOW_MS = 30 * 86_400_000;

export async function incidentsFor(userId: string, project = "") {
  const name = project.trim().toLowerCase();
  const refreshed = name ? await refreshRepoQuietly(userId, name) : "skipped";
  await resyncHostsQuietlyFor(userId);
  const now = Date.now();
  const failed = (await failedDeployments(userId)).filter((d) => d.at && now - Date.parse(d.at) <= WINDOW_MS);
  const incidents = failed
    .map((d) => {
      const projectName = d.name.replace(/\s+\(.*\)$/, "");
      return {
        kind: "deploy_failed" as const,
        project: projectName,
        environment: d.environment || null,
        host: d.provider,
        state: d.state,
        at: d.at,
        url: d.url,
        cause: d.cause,
        logTail: d.logTail,
        inspectorUrl: d.inspectorUrl,
        commit: d.sha ? { sha: d.sha, ref: d.ref ?? null, message: d.message ?? null } : null,
        source: d.cause ? `${d.provider ?? "host"} build log` : d.provider === "Vercel" ? "Vercel deployments" : "GitHub deployments",
      };
    })
    .filter((i) => !name || i.project.toLowerCase() === name || i.project.toLowerCase().endsWith(`/${name}`) || i.project.toLowerCase() === name.split("/").pop());
  return {
    incidents,
    checkedAt: new Date(now).toISOString(),
    repoRefreshed: refreshed === "refreshed",
    note: name
      ? "The named repo was re-read from GitHub just now (at most once a minute); Vercel is re-read when its last read is over 5 minutes old."
      : "Hosts are re-read when this is called and the last read is over 5 minutes old; name a project to re-read its repo right now.",
  };
}
