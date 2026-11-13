import { describe, expect, it } from "vitest";
import { buildListening } from "./agent-listening";
import type { Incident } from "./incidents";

const now = new Date("2026-11-12T22:00:00Z");
const deploy = (project: string): Incident => ({
  kind: "deploy_failed", key: "n1@t", project, environment: "production", host: "vercel", state: "ERROR", at: now.toISOString(), url: null, cause: null, logTail: [], inspectorUrl: null, commit: null, source: "vercel",
});

describe("buildListening", () => {
  it("keeps the newest read per project with its agent and open problems", () => {
    const reads = [
      { project: "n8peace/daystart", apiKeyId: "k1", at: new Date("2026-11-12T20:00:00Z") },
      { project: "n8peace/daystart", apiKeyId: "k2", at: new Date("2026-11-12T21:00:00Z") },
    ];
    const out = buildListening(reads, [deploy("daystart")], new Map([["k2", "macbook-read"]]), now);
    expect(out.listeners).toEqual([{ project: "n8peace/daystart", lastAskedAt: "2026-11-12T21:00:00.000Z", agent: "macbook-read", open: 1 }]);
    expect(out.unheard).toEqual([]);
  });

  it("lists broken projects that no session has asked about", () => {
    const out = buildListening([], [deploy("supportgrid"), deploy("supportgrid")], new Map(), now);
    expect(out.listeners).toEqual([]);
    expect(out.unheard).toEqual([{ project: "supportgrid", open: 2 }]);
  });
});
