import { describe, expect, it } from "vitest";
import { breakKind, breakPrompt, claimOn, openSplit, routingStatus, whatHappened, whatToDo, type BreakKind } from "./break-guide";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("breakKind", () => {
  it("maps chart kinds and job state to one kind", () => {
    expect(breakKind({ kind: "deploy", what: "Deploy failed" })).toBe("deploy_failed");
    expect(breakKind({ kind: "job", what: "nightly run failed" })).toBe("job_failed");
    expect(breakKind({ kind: "job", what: "nightly went quiet" })).toBe("job_quiet");
    expect(breakKind({ kind: "job", what: "nightly went quiet" }, "never_checked_in")).toBe("job_never");
    expect(breakKind({ kind: "site", what: "Site down" })).toBe("site_down");
    expect(breakKind({ kind: "check", what: "x" })).toBe("check");
  });
});

describe("whatToDo", () => {
  it("has one plain line per kind, no dashes", () => {
    const kinds: BreakKind[] = ["deploy_failed", "job_failed", "job_quiet", "job_never", "site_down", "server_errors", "check"];
    for (const k of kinds) {
      expect(whatToDo(k).length).toBeGreaterThan(10);
      expect(whatToDo(k)).not.toMatch(/[–—]/);
    }
  });
});

describe("whatHappened", () => {
  it("quotes the build log cause", () => {
    expect(whatHappened({ kind: "deploy_failed", what: "Deploy failed", cause: "Type error in a.ts" }, NOW)).toBe("The build log says: Type error in a.ts");
  });
  it("uses the job's last note", () => {
    expect(whatHappened({ kind: "job_failed", what: "x", note: "exit 1" }, NOW)).toBe("The job reported a failed run: exit 1");
  });
  it("says when a quiet job last checked in and was due", () => {
    expect(whatHappened({ kind: "job_quiet", what: "x", lastCheckIn: minsAgo(180), dueAt: minsAgo(60) }, NOW)).toBe("Went quiet: last check-in 3 h ago, was due 1 h ago.");
  });
});

describe("routingStatus", () => {
  it("says a break was sent and nobody has it", () => {
    expect(routingStatus("deploy_failed", null, NOW)).toEqual({ sent: true, text: "Sent to your agents. Nobody has picked it up yet." });
  });
  it("names the fixer and how long ago it claimed", () => {
    expect(routingStatus("job_quiet", { project: "a/b", agent: "Spooky fixer", apiKeyId: "k1", at: minsAgo(6) }, NOW).text).toBe("Sent to your agents. Your fixer claimed it 6 min ago.");
    expect(routingStatus("job_quiet", { project: "a/b", agent: "Laptop", apiKeyId: "k1", at: minsAgo(6) }, NOW).text).toBe("Sent to your agents. Laptop claimed it 6 min ago.");
  });
  it("is honest that suggestions and site checks are not sent", () => {
    expect(routingStatus("check", null, NOW)).toEqual({ sent: false, text: "Not sent to your agent: suggestions wait for you." });
    expect(routingStatus("site_down", null, NOW).sent).toBe(false);
  });
});

describe("breakPrompt", () => {
  it("names the project, the break, the cause and the confirm call", () => {
    const p = breakPrompt({ project: "n8peace/news-factory", what: "Deploy failed", cause: "Module not found", link: "https://vercel.com/x" });
    expect(p).toContain("n8peace/news-factory is broken: Deploy failed.");
    expect(p).toContain("Cause: Module not found");
    expect(p).toContain("pull request");
    expect(p).toContain("https://spookyparticles.com/api/v1/incidents/confirm?project=n8peace%2Fnews-factory");
  });
});

describe("openSplit", () => {
  it("explains why 4 open is 2 broken now", () => {
    const s = openSplit([
      { kind: "deploy", project: "a/web", status: "open" },
      { kind: "job", project: "a/jobs", status: "open" },
      { kind: "check", project: "a/web", status: "open" },
      { kind: "check", project: "a/jobs", status: "open" },
      { kind: "deploy", project: "a/old", status: "fixed" },
    ]);
    expect(s).toMatchObject({ open: 4, broken: 2, repeats: 0, checks: 2 });
    expect(s?.words).toBe("4 open: 2 broken now, 2 check findings waiting for you.");
  });
  it("counts two failures of one deploy once", () => {
    const s = openSplit([
      { kind: "deploy", project: "a/web", status: "open" },
      { kind: "deploy", project: "a/web", status: "open" },
    ]);
    expect(s?.words).toBe("2 open: 1 broken now, 1 more failure of the same break.");
  });
  it("is null when nothing is open", () => {
    expect(openSplit([{ kind: "deploy", project: "a", status: "fixed" }])).toBeNull();
  });
});

describe("claimOn", () => {
  it("matches owner/repo and repo alike", () => {
    const claims = [{ project: "n8peace/web", agent: null, apiKeyId: "k", at: minsAgo(1) }];
    expect(claimOn(claims, "web")).toBe(claims[0]);
    expect(claimOn(claims, "N8peace/Web")).toBe(claims[0]);
    expect(claimOn(claims, "other")).toBeNull();
    expect(claimOn(claims, null)).toBeNull();
  });
});
