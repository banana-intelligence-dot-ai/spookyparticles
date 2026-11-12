import { describe, expect, it } from "vitest";
import { logTailAndCause } from "@/lib/providers/vercel";
import { renderDeployFailed } from "@/lib/alerts/deploy-failed";
import { BUILD_LOG, INCIDENT } from "./incident";

describe("the hero's replayed incident", () => {
  it("shows the cause today's picker names for the real log", () => {
    expect(logTailAndCause(BUILD_LOG).cause).toBe(INCIDENT.cause);
    expect(BUILD_LOG.filter((l) => l.cause).map((l) => l.text)).toEqual([INCIDENT.cause]);
  });

  it("states the time to fix the timestamps give", () => {
    const s = (t: string) => t.split(":").map(Number).reduce((a, v) => a * 60 + v, 0);
    const gap = s(INCIDENT.fixed.readyAt) - s(INCIDENT.failed.failedAt);
    expect(INCIDENT.minutesToFix).toBe(`${Math.floor(gap / 60)} min ${gap % 60} s`);
    expect(s(INCIDENT.failed.failedAt) - s(INCIDENT.failed.startedAt)).toBe(INCIDENT.failed.seconds);
  });

  it("uses the subject line the alert email really has", async () => {
    const r = renderDeployFailed(
      { deploymentId: "d", project: INCIDENT.project, environment: "production", host: INCIDENT.host, at: null, cause: INCIDENT.cause, logTail: [], inspectorUrl: null, url: null },
      { todayUrl: "https://x/app", unsubscribeUrl: "https://x/u" },
    );
    expect(r.subject).toBe(INCIDENT.subject);
  });
});
