/** The move link and production-host transition use only facts already in the map. */

const INDEX = "https://vercel.com/kb/migrations";
const GUIDES: Record<string, { title: string; url: string }> = {
  Railway: { title: "Railway migration guide", url: "https://vercel.com/kb/guide/migrate-railway-to-vercel" },
  Render: { title: "Render migration guide", url: "https://vercel.com/kb/guide/migrate-render-to-vercel" },
  Heroku: { title: "Heroku Python API migration guide", url: "https://vercel.com/kb/guide/migrate-a-python-api-from-heroku-to-vercel" },
  "Fly.io": { title: "Fly.io migration guide", url: "https://vercel.com/kb/guide/migrate-fly-io-to-vercel" },
};
const HOSTS = new Set(["Netlify", "Render", "Railway", "Fly.io", "Heroku", "Cloudflare", "AWS", "GitHub Pages"]);

export type Elsewhere = { host: string; importUrl: string; guide: { title: string; url: string } | null; notes: string[] };
export type ProductionDeployment = { environment: string; state: string | null; provider: string | null; at: string | null; creator?: string | null };

function importUrl(repoUrl: string): string {
  return `https://vercel.com/new/import?s=${encodeURIComponent(repoUrl)}`;
}

/** No repo-content read or inferred framework. Only recognized hosts and GitHub repos qualify. */
export function moveHome(row: { host: string | null; repoFullName: string; repoUrl: string | null; framework?: string | null; language?: string | null; creator?: string | null }): Elsewhere | null {
  if (!row.host || !HOSTS.has(row.host)) return null;
  const canonical = `https://github.com/${row.repoFullName}`;
  if (!/^[^/]+\/[^/]+$/.test(row.repoFullName) || row.repoUrl !== canonical) return null;
  const notes = row.creator === "github-actions" ? ["Deploys from GitHub Actions today"] : [];
  const python = row.language?.toLowerCase() === "python" || ["fastapi", "flask", "django"].includes(row.framework?.toLowerCase() ?? "");
  const guide = row.host === "Heroku" && !python ? null : GUIDES[row.host];
  return { host: row.host, importUrl: importUrl(canonical), guide: guide ?? { title: "Vercel migration guides", url: INDEX }, notes };
}

/** The newest successful production deploy is the current observed production host. */
export function productionHost(deployments: ProductionDeployment[]): { host: string; at: string } | null {
  const latest = deployments
    .filter((d) => d.environment.toLowerCase() === "production" && d.state === "success" && d.provider && d.at)
    .sort((a, b) => b.at!.localeCompare(a.at!))[0];
  return latest ? { host: latest.provider!, at: latest.at! } : null;
}

export function moveDecision(recordedHost: unknown, movedAt: unknown, deployments: ProductionDeployment[]): { kind: "remember" | "moved"; host: string; at: string } | null {
  const current = productionHost(deployments);
  if (!current || movedAt) return null;
  if (current.host === "Vercel") {
    const prior = deployments.filter((d) => d.environment.toLowerCase() === "production" && d.state === "success" && d.at && d.at < current.at && d.provider && HOSTS.has(d.provider))
      .sort((a, b) => b.at!.localeCompare(a.at!))[0]?.provider;
    const from = typeof recordedHost === "string" && HOSTS.has(recordedHost) ? recordedHost : prior;
    return from ? { kind: "moved", host: from, at: current.at } : null;
  }
  return HOSTS.has(current.host) && recordedHost !== current.host ? { kind: "remember", host: current.host, at: current.at } : null;
}
