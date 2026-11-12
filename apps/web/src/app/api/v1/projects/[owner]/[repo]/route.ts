/**
 * GET /api/v1/projects/{owner}/{repo}: one project's whole page. The repo and its status;
 * the stack (language from GitHub, hosts from deploys and hosting bills, services from bills);
 * monthly cost with Spend's math over the bills linked to it (shared bills counted once, never
 * split); deployments, domains and services with their sources and owners; and
 * recommendations, each with its amount, evidence rows and the vendor's billing page.
 * Read-only: nothing here acts on any account. 404 when no connected repo has that name.
 */
import { api, ApiError, json } from "@/lib/http";
import { projectPageFor } from "@/lib/projects";
import { requireActor } from "@/lib/require-actor";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

export const GET = api<Ctx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { owner, repo } = await ctx.params;
  const name = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`;
  const page = await projectPageFor(actor.userId, name);
  if (!page) throw new ApiError(404, "not_found", `No connected repo named ${name}`);
  return json(page);
});
