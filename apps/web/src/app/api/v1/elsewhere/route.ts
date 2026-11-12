/** GET /api/v1/elsewhere: actionable off-Vercel repos and recorded moves. */
import { api, json } from "@/lib/http";
import { projectsFor } from "@/lib/projects";
import { moveHome } from "@/lib/move-home";
import { requireActor } from "@/lib/require-actor";
import { resyncHostsQuietlyFor } from "@/lib/sync";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  await resyncHostsQuietlyFor(actor.userId);
  const report = await projectsFor(actor.userId);
  return json({ projects: report.projects.flatMap((p) => {
    if (p.elsewhere) return [{ project: p.name, host: p.elsewhere.host, importUrl: p.elsewhere.importUrl, guideUrl: p.elsewhere.guideUrl }];
    const prior = p.movedFrom ? moveHome({ host: p.movedFrom, repoFullName: p.name, repoUrl: p.url }) : null;
    if (p.movedAt && prior) return [{ project: p.name, host: prior.host, importUrl: prior.importUrl, guideUrl: prior.guide?.url ?? null, movedAt: p.movedAt }];
    return [];
  }) });
});
