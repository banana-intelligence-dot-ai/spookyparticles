/**
 * "Is this service still used?" judged only from what the sync already stores:
 * the project's paused flag, its production deploy date, and when Vercel's
 * request history last showed traffic. No new call to Vercel.
 */
export const IDLE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export type ProjectFacts = {
  project: string;
  paused: boolean;
  /** When the deployment serving production was created. Null when it never deployed to production. */
  productionAt: string | null;
  /** The last 15 minute window in which Vercel's request history showed any request. */
  lastTrafficAt: string | null;
  /** When we first read this project's request history. Null when it is not readable. */
  trafficReadSince: string | null;
};

export type ProjectUsage = { project: string; state: "in_use" | "idle" | "unknown"; reason: string };
export type ServiceUsage = { state: "in_use" | "idle" | "unknown"; basis: string; projects: ProjectUsage[] };

const day = (iso: string) => iso.slice(0, 10);
const recent = (iso: string | null, nowMs: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && nowMs - t <= IDLE_AFTER_DAYS * DAY_MS;
};

export function projectUsage(f: ProjectFacts, nowMs: number): ProjectUsage {
  if (f.paused) return { project: f.project, state: "idle", reason: "paused on Vercel" };
  if (f.productionAt && recent(f.productionAt, nowMs)) return { project: f.project, state: "in_use", reason: `production deploy ${day(f.productionAt)}` };
  if (f.lastTrafficAt && recent(f.lastTrafficAt, nowMs)) return { project: f.project, state: "in_use", reason: `requests seen ${day(f.lastTrafficAt)}` };
  const deploy = f.productionAt ? `no production deploy since ${day(f.productionAt)}` : "never deployed to production";
  // An old deploy may still serve visitors; without request history that cannot be called idle.
  if (f.productionAt && !f.trafficReadSince) return { project: f.project, state: "unknown", reason: `${deploy}, traffic not readable` };
  const traffic = !f.trafficReadSince
    ? "traffic not readable"
    : recent(f.trafficReadSince, nowMs) ? `no requests seen since ${day(f.trafficReadSince)}` : `no requests in ${IDLE_AFTER_DAYS} days`;
  return { project: f.project, state: "idle", reason: `${deploy}, ${traffic}` };
}

/** In use when any project that depends on it is in use. Idle only when every one is idle. */
export function serviceUsage(projects: ProjectFacts[], nowMs: number): ServiceUsage {
  const each = projects.map((p) => projectUsage(p, nowMs)).sort((a, b) => a.project.localeCompare(b.project));
  const using = each.filter((p) => p.state === "in_use");
  if (using.length) return { state: "in_use", basis: `In use: ${using.map((p) => `${p.project} (${p.reason})`).join("; ")}.`, projects: each };
  const list = each.map((p) => `${p.project} (${p.reason})`).join("; ");
  if (each.some((p) => p.state === "unknown")) return { state: "unknown", basis: `Unknown: ${list}.`, projects: each };
  return { state: "idle", basis: `Idle: ${list}.`, projects: each };
}
