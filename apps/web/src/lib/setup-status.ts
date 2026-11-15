export type SetupConnectionStatus = "missing" | "syncing" | "synced" | "errored";

type SetupConnection = {
  provider: string;
  status: string;
  sync: { phase: string; finishedAt: unknown; error?: string | null } | null;
};

type SetupJob = { status: string; watched?: boolean };
type SetupProject = { elsewhere?: unknown };

export type SetupStatus = {
  ready: boolean;
  github: SetupConnectionStatus;
  vercel: SetupConnectionStatus;
  broken: number;
  jobs: { total: number; watched: number; issues: number };
  elsewhere: number;
  next: string;
  links: { connect: string; today: string; jobs: string };
};

export function connectionSetupStatus(connections: SetupConnection[], provider: "github" | "vercel"): SetupConnectionStatus {
  const matching = connections.filter((connection) => connection.provider === provider);
  if (matching.some((connection) => connection.status === "active" && connection.sync?.phase === "done" && Boolean(connection.sync.finishedAt))) {
    return "synced";
  }
  if (matching.some((connection) => connection.status === "active" && !connection.sync?.error)) return "syncing";
  if (matching.some((connection) => connection.status === "errored" || Boolean(connection.sync?.error))) return "errored";
  return "missing";
}

export function nextSetupStep(
  github: SetupConnectionStatus,
  vercel: SetupConnectionStatus,
  broken: number,
  connectLink: string,
): string {
  if (github === "missing" || vercel === "missing") return `Connect GitHub and Vercel at ${connectLink}.`;
  if (github === "syncing" || vercel === "syncing") return "First read is running. This takes a minute or two.";
  if (github === "errored" || vercel === "errored") return `A connection needs attention at ${connectLink}.`;
  if (broken > 0) return `${broken} broken now. Read them with: sh scripts/spooky.sh problems`;
  return "All clear. Turn on agent alerts next: sh scripts/spooky.sh alerts";
}

export function setupStatus(
  input: {
    connections: SetupConnection[];
    incidents: { incidents: unknown[] };
    jobs: SetupJob[];
    projects: { projects: SetupProject[] };
  },
  origin: string,
): SetupStatus {
  const links = {
    connect: new URL("/app", origin).toString(),
    today: new URL("/app", origin).toString(),
    jobs: new URL("/app/jobs", origin).toString(),
  };
  const github = connectionSetupStatus(input.connections, "github");
  const vercel = connectionSetupStatus(input.connections, "vercel");
  const broken = input.incidents.incidents.length;
  const hasWatchedField = input.jobs.some((job) => Object.hasOwn(job, "watched"));
  return {
    ready: github === "synced" && vercel === "synced",
    github,
    vercel,
    broken,
    jobs: {
      total: input.jobs.length,
      watched: hasWatchedField ? input.jobs.filter((job) => job.watched === true).length : input.jobs.length,
      issues: input.jobs.filter((job) => ["late", "down", "never_checked_in"].includes(job.status)).length,
    },
    elsewhere: input.projects.projects.filter((project) => Boolean(project.elsewhere)).length,
    next: nextSetupStep(github, vercel, broken, links.connect),
    links,
  };
}

function connectionWords(status: SetupConnectionStatus, connectLink: string): string {
  if (status === "missing") return `waiting (connect it at ${connectLink})`;
  if (status === "errored") return `needs attention (open ${connectLink})`;
  return status;
}

export function formatSetupText(status: SetupStatus): string {
  return [
    `GitHub: ${connectionWords(status.github, status.links.connect)}`,
    `Vercel: ${connectionWords(status.vercel, status.links.connect)}`,
    `Broken now: ${status.broken}`,
    `Scheduled jobs: ${status.jobs.watched} watched, ${status.jobs.issues} needs a look`,
    `Still on another host: ${status.elsewhere}`,
    `Next: ${status.next}`,
    "",
  ].join("\n");
}
