import { describe, expect, it } from "vitest";
import { formatIncidentsText, matchesIncidentProject, type Incident } from "./incidents";

describe("incident project matching", () => {
  it("matches the full repo or its final name", () => {
    expect(matchesIncidentProject("owner/repo", "owner/repo")).toBe(true);
    expect(matchesIncidentProject("owner/repo", "repo")).toBe(true);
    expect(matchesIncidentProject("repo", "owner/repo")).toBe(true);
    expect(matchesIncidentProject("other/repo", "owner/elsewhere")).toBe(false);
    expect(matchesIncidentProject(null, "repo")).toBe(false);
  });
});

describe("agent inbox text", () => {
  it("returns an empty body when nothing is open", () => {
    expect(formatIncidentsText({ incidents: [] }, "owner/repo", "https://spooky.example")).toBe("");
  });

  it("formats deploy and job evidence with the request origin", () => {
    const incidents: Incident[] = [
      {
        kind: "deploy_failed",
        project: "owner/repo",
        environment: "production",
        host: "Vercel",
        state: "failed",
        at: "2026-11-11T20:00:00.000Z",
        url: "https://repo.example",
        cause: "Type error on line 42",
        logTail: [],
        inspectorUrl: "https://vercel.com/acme/repo/deployments/one",
        commit: null,
        source: "Vercel build log",
      },
      {
        kind: "job",
        name: "Nightly index",
        project: "owner/repo",
        status: "down",
        issue: "failed",
        lastCheckIn: "2026-11-11T21:00:00.000Z",
        lastNote: "Index command exited 1",
        nextDue: "2026-11-12T21:00:00.000Z",
        url: "/app/jobs",
      },
    ];

    const text = formatIncidentsText({ incidents }, "owner/repo", "https://spooky.example");
    expect(text).toContain("Spooky Particles: 2 open problems for owner/repo");
    expect(text).toContain("Build log: Type error on line 42");
    expect(text).toContain("Last note: Index command exited 1");
    expect(text).toContain("Link: https://spooky.example/app/jobs");
    expect(text).toContain('printf \'Authorization: Bearer %s\\n\' "$SPOOKY_API_KEY" | curl -fsS -H @- "https://spooky.example/api/v1/incidents?project=owner%2Frepo&format=text"');
  });

  it("does not print API keys, ping tokens, or extra incident fields", () => {
    const secret = "sp_secret_token_123456789";
    const pingToken = "pingToken1234567890";
    const incident = {
      kind: "job" as const,
      name: "Daily report",
      project: null,
      status: "down",
      issue: "quiet" as const,
      lastCheckIn: null,
      lastNote: `request used ${secret} at /api/ping/${pingToken}`,
      nextDue: null,
      url: "/app/jobs" as const,
      pingUrl: `https://spooky.example/api/ping/${pingToken}`,
    };

    const text = formatIncidentsText({ incidents: [incident] }, "", "https://spooky.example");
    expect(text).toContain("[redacted]");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(pingToken);
    expect(text).not.toContain("pingUrl");
  });
});
