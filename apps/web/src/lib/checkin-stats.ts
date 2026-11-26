import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type StatsValue = {
  day: string;
  mainName: string;
  mainValue: number;
  mainWeek: number | null;
  counts: Record<string, number>;
};

export type LatestNumber = {
  app: string;
  day: string;
  mainName: string;
  mainValue: number;
  week: number | null;
  counts: Record<string, number>;
  /** The day is a UTC day (Vercel Web Analytics), not a Pacific one. */
  utcDay?: boolean;
};

const NAME = /^[a-z0-9][a-z0-9 _-]{0,23}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALUE = 2_000_000_000;

function shiftDay(day: string, offsetDays: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function pacificDay(ms: number, offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return shiftDay(`${part("year")}-${part("month")}-${part("day")}`, offsetDays);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function allowed(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_VALUE;
}

export function parseStats(raw: unknown, nowMs: number): { ok: true; value: StatsValue } | { ok: false; error: string } {
  if (!object(raw) || !allowed(raw, ["day", "main", "counts"])) return { ok: false, error: "Invalid fields" };
  const main = raw.main;
  if (!object(main) || !allowed(main, ["name", "value", "week"])) return { ok: false, error: "Invalid main" };
  if (typeof main.name !== "string" || !NAME.test(main.name) || !validNumber(main.value)) return { ok: false, error: "Invalid main name or value" };
  if (main.week !== undefined && !validNumber(main.week)) return { ok: false, error: "Invalid week value" };

  const day = raw.day === undefined ? pacificDay(nowMs, -1) : raw.day;
  if (typeof day !== "string" || !DAY.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    return { ok: false, error: "Invalid day" };
  }
  if (day > pacificDay(nowMs) || day < pacificDay(nowMs, -31)) return { ok: false, error: "Day is outside the allowed range" };

  const counts = raw.counts === undefined ? {} : raw.counts;
  if (!object(counts) || Object.keys(counts).length > 3 || Object.entries(counts).some(([name, value]) => !NAME.test(name) || !validNumber(value))) {
    return { ok: false, error: "Invalid counts" };
  }
  return { ok: true, value: { day, mainName: main.name, mainValue: main.value, mainWeek: (main.week as number | undefined) ?? null, counts: counts as Record<string, number> } };
}

export async function recordStats(token: string, value: StatsValue): Promise<{ ok: true; job: string } | { ok: false; reason: "unknown" }> {
  if (!token || token.length > 200) return { ok: false, reason: "unknown" };
  const db = getDb();
  const [job] = await db.select({ id: schema.checkinJobs.id, name: schema.checkinJobs.name }).from(schema.checkinJobs)
    .where(and(eq(schema.checkinJobs.token, token), ne(schema.checkinJobs.status, "retired"))).limit(1);
  if (!job) return { ok: false, reason: "unknown" };
  await db.insert(schema.checkinStats).values({ jobId: job.id, day: value.day, mainName: value.mainName, mainValue: value.mainValue, mainWeek: value.mainWeek, counts: value.counts })
    .onConflictDoUpdate({ target: [schema.checkinStats.jobId, schema.checkinStats.day], set: { mainName: value.mainName, mainValue: value.mainValue, mainWeek: value.mainWeek, counts: value.counts, receivedAt: new Date() } });
  return { ok: true, job: job.name };
}

export async function latestNumbers(userId: string): Promise<{ apps: LatestNumber[]; uncounted: string[] }> {
  const rows = await getDb().select({ job: schema.checkinJobs, stat: schema.checkinStats }).from(schema.checkinJobs)
    .leftJoin(schema.checkinStats, eq(schema.checkinStats.jobId, schema.checkinJobs.id))
    .where(eq(schema.checkinJobs.userId, userId));
  const byJob = new Map<string, { job: (typeof rows)[number]["job"]; stats: NonNullable<(typeof rows)[number]["stat"]>[] }>();
  const countedLabels = new Set<string>();
  for (const { job, stat } of rows) {
    const label = job.project ?? job.name;
    if (stat) countedLabels.add(label);
    if (job.status === "retired") continue;
    if (!byJob.has(job.id)) byJob.set(job.id, { job, stats: [] });
    if (stat) byJob.get(job.id)!.stats.push(stat);
  }
  const apps: LatestNumber[] = [];
  for (const { job, stats } of byJob.values()) {
    if (!stats.length) continue;
    stats.sort((a, b) => b.day.localeCompare(a.day));
    const latest = stats[0];
    let week = latest.mainWeek;
    if (week === null) {
      const values = new Map(stats.map((s) => [s.day, s.mainValue]));
      const days = Array.from({ length: 7 }, (_, i) => values.get(shiftDay(latest.day, -i)));
      if (days.every((n) => n !== undefined)) week = days.reduce<number>((sum, n) => sum + n!, 0);
    }
    apps.push({ app: job.project ?? job.name, day: latest.day, mainName: latest.mainName, mainValue: latest.mainValue, week, counts: latest.counts });
  }
  const uncounted = countedLabels.size === 0 ? [] : [...new Set(rows.filter(({ job }) => job.status !== "retired" && job.status !== "paused").map(({ job }) => job.project ?? job.name).filter((label) => !countedLabels.has(label)))].sort();
  return { apps, uncounted };
}
