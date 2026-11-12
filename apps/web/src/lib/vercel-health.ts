/** lastTrafficAt and readSince are kept for the services list: they say when requests were last seen and since when we have been reading. */
export type ErrorRateState = { incidentAt: string | null; recoveryWindows: number; lastTrafficAt?: string | null; readSince?: string };
export type UptimeState = { state: "up" | "down" | "protected" | "unknown"; since: string; lastCheckedAt: string; lastStatus: string; consecutiveDown: number; alertAt?: string | null };

export function nextErrorRate(prior: ErrorRateState | null, counts: { total: number; serverErrors: number }, at: string): { state: ErrorRateState; event: "alert" | "recovered" | null } {
  const old = prior ?? { incidentAt: null, recoveryWindows: 0 };
  const seen = { lastTrafficAt: counts.total > 0 ? at : old.lastTrafficAt ?? null, readSince: old.readSince ?? at };
  const rate = counts.total ? counts.serverErrors / counts.total : 0;
  if (!old.incidentAt) return counts.serverErrors >= 10 && rate >= 0.2
    ? { state: { incidentAt: at, recoveryWindows: 0, ...seen }, event: "alert" }
    : { state: { ...old, ...seen }, event: null };
  const recoveryWindows = rate < 0.05 ? old.recoveryWindows + 1 : 0;
  return recoveryWindows >= 2
    ? { state: { incidentAt: null, recoveryWindows: 0, ...seen }, event: "recovered" }
    : { state: { ...old, recoveryWindows, ...seen }, event: null };
}

export function nextUptime(prior: UptimeState | null, result: { kind: "up" | "down" | "protected" | "unknown"; status: string }, at: string): { state: UptimeState; event: "alert" | "recovered" | null } {
  const old = prior ?? { state: "unknown" as const, since: at, lastCheckedAt: at, lastStatus: "unknown", consecutiveDown: 0 };
  if (result.kind === "unknown") return { state: { ...old, state: "unknown", since: old.state === "unknown" ? old.since : at, lastCheckedAt: at, lastStatus: result.status, consecutiveDown: 0 }, event: null };
  if (result.kind === "protected") return { state: { ...old, state: "protected", since: old.state === "protected" ? old.since : at, lastCheckedAt: at, lastStatus: result.status, consecutiveDown: 0 }, event: null };
  if (result.kind === "up") return { state: { state: "up", since: old.state === "up" ? old.since : at, lastCheckedAt: at, lastStatus: result.status, consecutiveDown: 0, alertAt: null }, event: old.alertAt ? "recovered" : null };
  const consecutiveDown = old.state === "down" ? old.consecutiveDown + 1 : 1;
  const since = old.state === "down" ? old.since : at;
  const alertAt = old.alertAt ?? (consecutiveDown >= 2 ? since : null);
  return { state: { state: "down", since, lastCheckedAt: at, lastStatus: result.status, consecutiveDown, alertAt }, event: !old.alertAt && consecutiveDown >= 2 ? "alert" : null };
}
