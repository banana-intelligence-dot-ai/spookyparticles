/** Small, strict UTC cron reader. Unsupported syntax returns null. */
export type Schedule = {
  name: string;
  path: string;
  schedule: string;
  method: string;
  timeZone: string | null;
  jitterMinutes: number;
};
export type RunEvidence = { atMs: number; path: string; status: number };
export type RunDecision = { dueMs: number; kind: "ok" | "fail" | "missed"; atMs: number | null; status: number | null };

/** Legacy cron definitions still live on the project response. Vercel Schedules do not. */
export function pickSchedules(project: { crons?: unknown }): Schedule[] {
  const out: Schedule[] = [];
  const crons = project.crons as { definitions?: unknown } | undefined;
  if (Array.isArray(crons?.definitions)) for (const raw of crons.definitions) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    if (typeof x.path === "string" && x.path.startsWith("/") && typeof x.schedule === "string")
      out.push({ name: x.path, path: x.path, schedule: x.schedule, method: "GET", timeZone: null, jitterMinutes: 0 });
  }
  return out;
}

/** Reduce the Schedules API's objects to the active path crons the watcher can observe. */
export function pickVercelSchedules(list: unknown): Schedule[] {
  if (!Array.isArray(list)) return [];
  const out: Schedule[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    const expression = x.expression && typeof x.expression === "object" ? x.expression as Record<string, unknown> : null;
    const target = x.target && typeof x.target === "object" ? x.target as Record<string, unknown> : null;
    if (x.state !== "active" || expression?.type !== "cron" || target?.type !== "path") continue;
    if (typeof x.name !== "string" || !x.name || typeof expression.cron !== "string" || typeof target.path !== "string" || !target.path.startsWith("/")) continue;
    const zone = typeof x.timezone === "string" && x.timezone !== "UTC" && validTimeZone(x.timezone) ? x.timezone : null;
    out.push({
      name: x.name,
      path: target.path,
      schedule: expression.cron,
      method: typeof target.requestMethod === "string" ? target.requestMethod.toUpperCase() : "POST",
      timeZone: zone,
      jitterMinutes: typeof x.jitter === "number" && Number.isFinite(x.jitter) ? Math.max(0, Math.min(15, Math.round(x.jitter))) : 1,
    });
  }
  return out;
}

/** Keep the first definition when both APIs describe the same named path. */
export function mergeSchedules(...lists: Schedule[][]): Schedule[] {
  const seen = new Set<string>();
  return lists.flat().filter((schedule) => {
    const key = `${schedule.name}\0${schedule.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function field(raw: string, low: number, high: number): Set<number> | null {
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) return null;
    const step = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isInteger(step) || step < 1 || step > high - low + 1) return null;
    const [start, end] = match[1] === "*" ? [low, high] : match[1].includes("-") ? match[1].split("-").map(Number) : [Number(match[1]), match[2] ? high : Number(match[1])];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < low || end > high || start > end) return null;
    for (let n = start; n <= end; n += step) values.add(n);
  }
  return values;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
export function validTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return true; } catch { return false; }
}
function wallParts(ms: number, timeZone: string): { minute: number; hour: number; day: number; month: number; weekday: number } {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", minute: "2-digit", hour: "2-digit", day: "2-digit", month: "2-digit", weekday: "short" });
    formatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((p) => [p.type, p.value]));
  return { minute: Number(parts.minute), hour: Number(parts.hour), day: Number(parts.day), month: Number(parts.month), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
}

export function validSchedule(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  return parts.length === 5 && [field(parts[0], 0, 59), field(parts[1], 0, 23), field(parts[2], 1, 31), field(parts[3], 1, 12), field(parts[4], 0, 7)].every(Boolean);
}

export function expectedRuns(expression: string, afterMs: number, throughMs: number, limit = Number.POSITIVE_INFINITY, timeZone = "UTC"): number[] | null {
  const parts = expression.trim().split(/\s+/);
  if (!validTimeZone(timeZone) || parts.length !== 5 || !Number.isFinite(afterMs) || !Number.isFinite(throughMs) || throughMs - afterMs > 5 * 366 * 86_400_000) return null;
  const fields = [field(parts[0], 0, 59), field(parts[1], 0, 23), field(parts[2], 1, 31), field(parts[3], 1, 12), field(parts[4], 0, 7)];
  if (fields.some((f) => !f)) return null;
  const [minute, hour, day, month, weekday] = fields as Set<number>[];
  const out: number[] = [];
  for (let ms = Math.floor(afterMs / 60_000) * 60_000 + 60_000; ms <= throughMs; ms += 60_000) {
    const utc = new Date(ms);
    const d = timeZone === "UTC" ? { minute: utc.getUTCMinutes(), hour: utc.getUTCHours(), day: utc.getUTCDate(), month: utc.getUTCMonth() + 1, weekday: utc.getUTCDay() } : wallParts(ms, timeZone);
    const dow = d.weekday;
    const domMatch = day.has(d.day);
    const dowMatch = weekday.has(dow) || (dow === 0 && weekday.has(7));
    const dayMatch = parts[2] === "*" ? dowMatch : parts[4] === "*" ? domMatch : domMatch || dowMatch;
    if (minute.has(d.minute) && hour.has(d.hour) && month.has(d.month) && dayMatch) {
      out.push(ms);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function nextRun(expression: string, afterMs: number, timeZone = "UTC"): number | null {
  return expectedRuns(expression, afterMs, afterMs + 5 * 366 * 86_400_000, 1, timeZone)?.[0] ?? null;
}

export function decideRuns(expected: number[], evidence: RunEvidence[], path: string, graceMs: number, nowMs: number): RunDecision[] {
  const available = evidence.filter((e) => e.path === path.split("?")[0]).sort((a, b) => a.atMs - b.atMs);
  const used = new Set<number>();
  return expected.map((due): RunDecision => {
    const lower = Math.floor(due / 60_000) * 60_000 - 60_000;
    const upper = Math.floor((due + graceMs) / 60_000) * 60_000;
    const index = available.findIndex((e, i) => !used.has(i) && e.atMs >= lower && e.atMs <= upper && e.atMs <= nowMs);
    if (index >= 0) used.add(index);
    const match = index >= 0 ? available[index] : null;
    return { dueMs: due, kind: match ? (match.status >= 400 ? "fail" : "ok") : "missed", atMs: match?.atMs ?? null, status: match?.status ?? null };
  }).filter((d) => d.kind !== "missed" || d.dueMs + graceMs <= nowMs);
}
