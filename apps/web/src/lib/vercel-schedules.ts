/** Small, strict UTC cron reader. Unsupported syntax returns null. */
export type Schedule = { name: string; path: string; schedule: string; method: string };
export type RunEvidence = { atMs: number; path: string; status: number };
export type RunDecision = { dueMs: number; kind: "ok" | "fail" | "missed"; atMs: number | null; status: number | null };

export function pickSchedules(project: { crons?: unknown; schedules?: unknown }): Schedule[] {
  const out: Schedule[] = [];
  const crons = project.crons as { definitions?: unknown } | undefined;
  if (Array.isArray(crons?.definitions)) for (const raw of crons.definitions) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    if (typeof x.path === "string" && x.path.startsWith("/") && typeof x.schedule === "string")
      out.push({ name: x.path, path: x.path, schedule: x.schedule, method: "GET" });
  }
  if (project.schedules && typeof project.schedules === "object" && !Array.isArray(project.schedules)) {
    for (const [name, raw] of Object.entries(project.schedules)) {
      if (!raw || typeof raw !== "object") continue;
      const x = raw as Record<string, unknown>;
      if (typeof x.path === "string" && x.path.startsWith("/") && typeof x.schedule === "string")
        out.push({ name, path: x.path, schedule: x.schedule, method: typeof x.requestMethod === "string" ? x.requestMethod.toUpperCase() : "GET" });
    }
  }
  return out;
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

export function expectedRuns(expression: string, afterMs: number, throughMs: number, limit = Number.POSITIVE_INFINITY): number[] | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 || !Number.isFinite(afterMs) || !Number.isFinite(throughMs) || throughMs - afterMs > 5 * 366 * 86_400_000) return null;
  const fields = [field(parts[0], 0, 59), field(parts[1], 0, 23), field(parts[2], 1, 31), field(parts[3], 1, 12), field(parts[4], 0, 7)];
  if (fields.some((f) => !f)) return null;
  const [minute, hour, day, month, weekday] = fields as Set<number>[];
  const out: number[] = [];
  for (let ms = Math.floor(afterMs / 60_000) * 60_000 + 60_000; ms <= throughMs; ms += 60_000) {
    const d = new Date(ms);
    const dow = d.getUTCDay();
    const domMatch = day.has(d.getUTCDate());
    const dowMatch = weekday.has(dow) || (dow === 0 && weekday.has(7));
    const dayMatch = parts[2] === "*" ? dowMatch : parts[4] === "*" ? domMatch : domMatch || dowMatch;
    if (minute.has(d.getUTCMinutes()) && hour.has(d.getUTCHours()) && month.has(d.getUTCMonth() + 1) && dayMatch) {
      out.push(ms);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function nextRun(expression: string, afterMs: number): number | null {
  return expectedRuns(expression, afterMs, afterMs + 5 * 366 * 86_400_000, 1)?.[0] ?? null;
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
