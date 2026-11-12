import { describe, expect, it } from "vitest";
import { nextErrorRate, nextUptime } from "./vercel-health";

describe("error rate incident", () => {
  it("alerts at both thresholds and recovers after two quiet windows", () => {
    const first = nextErrorRate(null, { total: 50, serverErrors: 10 }, "t1");
    expect(first.event).toBe("alert");
    expect(nextErrorRate(null, { total: 100, serverErrors: 10 }, "t1").event).toBeNull();
    const quiet = nextErrorRate(first.state, { total: 100, serverErrors: 4 }, "t2");
    expect(quiet.event).toBeNull();
    expect(nextErrorRate(quiet.state, { total: 0, serverErrors: 0 }, "t3").event).toBe("recovered");
    expect(nextErrorRate(first.state, { total: 100, serverErrors: 5 }, "t3").state.recoveryWindows).toBe(0);
  });

  it("remembers when requests were last seen and since when it has read", () => {
    const busy = nextErrorRate(null, { total: 3, serverErrors: 0 }, "t1");
    expect(busy.state).toMatchObject({ lastTrafficAt: "t1", readSince: "t1" });
    const quiet = nextErrorRate(busy.state, { total: 0, serverErrors: 0 }, "t2");
    expect(quiet.state).toMatchObject({ lastTrafficAt: "t1", readSince: "t1" });
    expect(nextErrorRate(null, { total: 0, serverErrors: 0 }, "t3").state).toMatchObject({ lastTrafficAt: null, readSince: "t3" });
  });
});

describe("uptime incident", () => {
  it("alerts after two downs, recovers on first up, and never alerts on protection", () => {
    const first = nextUptime(null, { kind: "down", status: "503" }, "t1");
    expect(first.event).toBeNull();
    const second = nextUptime(first.state, { kind: "down", status: "timeout" }, "t2");
    expect(second.event).toBe("alert");
    expect(nextUptime(second.state, { kind: "down", status: "503" }, "t3").event).toBeNull();
    expect(nextUptime(second.state, { kind: "up", status: "200" }, "t3").event).toBe("recovered");
    expect(nextUptime(first.state, { kind: "protected", status: "401" }, "t2").event).toBeNull();
  });
});
