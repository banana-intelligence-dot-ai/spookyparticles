/**
 * The help tools' data layer: the same server functions the MCP read tools and
 * the REST routes call. Kept apart from tools.ts so tests can swap it out.
 */
import { listJobs } from "@/lib/checkins";
import { claimsFor } from "@/lib/claims";
import { listConnectionsWithSync } from "@/lib/connections";
import { incidentsFor } from "@/lib/incidents";
import { projectPageFor, projectsFor } from "@/lib/projects";
import type { HelpData } from "./tools";

export const helpData: HelpData = {
  incidents: (userId, project) => incidentsFor(userId, project),
  jobs: (userId) => listJobs(userId),
  claims: (userId) => claimsFor(userId),
  projects: (userId) => projectsFor(userId),
  projectPage: (userId, name) => projectPageFor(userId, name),
  connections: (userId) => listConnectionsWithSync(userId),
};
