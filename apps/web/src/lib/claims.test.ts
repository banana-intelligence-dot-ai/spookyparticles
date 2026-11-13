import { describe, expect, it } from "vitest";
import { CLAIMED, claimFor, liveClaims } from "./claims";
import { FIX_CONFIRMED } from "./catches";
import { formatIncidentsText, type Incident } from "./incidents";

const now = Date.parse("2026-11-12T20:00:00Z");
const at = (minAgo: number) => new Date(now - minAgo * 60_000);
const names = new Map([["k1", "macbook-claude"], ["k2", "cursor"]]);

describe("liveClaims", () => {
  it("keeps the newest live claim per project and names the agent", () => {
    const claims = liveClaims([
      { name: CLAIMED, properties: { project: "acme/web", apiKeyId: "k1" }, createdAt: at(20) },
      { name: CLAIMED, properties: { project: "acme/web", apiKeyId: "k2" }, createdAt: at(5) },
      { name: CLAIMED, properties: { project: "acme/old", apiKeyId: "k1" }, createdAt: at(45) },
    ], names, now);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ project: "acme/web", agent: "cursor", until: new Date(now + 25 * 60_000).toISOString() });
    expect(claimFor(claims, "web")?.apiKeyId).toBe("k2");
  });

  it("ends a claim when a later fix check said fixed", () => {
    expect(liveClaims([
      { name: CLAIMED, properties: { project: "acme/web", apiKeyId: "k1" }, createdAt: at(10) },
      { name: FIX_CONFIRMED, properties: { project: "acme/web", verdict: "fixed" }, createdAt: at(2) },
    ], names, now)).toEqual([]);
  });
});

describe("inbox text with claims and evidence", () => {
  const deploy: Incident = {
    kind: "deploy_failed", key: "n1@t", project: "acme/web", environment: "production", host: "Vercel", state: "error", at: "2026-11-12T19:40:00Z", url: null,
    cause: "Type error", logTail: ["> next build", "Failed to compile.", "./app/page.tsx:4:2 Type error"], inspectorUrl: null,
    commit: { sha: "a1b2c3d4e5f6", ref: "main", message: "Rename the today page" }, source: "Vercel build log",
  };
  const claim = { project: "acme/web", apiKeyId: "k2", agent: "cursor", at: at(5).toISOString(), until: new Date(now + 25 * 60_000).toISOString() };

  it("shows the failing commit and the last log lines, and asks an unclaimed agent to claim", () => {
    const text = formatIncidentsText({ incidents: [deploy] }, "acme/web", "https://spooky.example");
    expect(text).toContain("Change: a1b2c3d Rename the today page (main)");
    expect(text).toContain("  | ./app/page.tsx:4:2 Type error");
    expect(text).toContain("/api/v1/incidents/claim?project=acme%2Fweb");
  });

  it("tells another session who is on it, and the owner that it is theirs", () => {
    const other = formatIncidentsText({ incidents: [deploy] }, "acme/web", "https://spooky.example", { claims: [claim], viewerKeyId: "k1" });
    expect(other).toContain("Claimed: by cursor");
    expect(other).not.toContain("/api/v1/incidents/claim");
    const mine = formatIncidentsText({ incidents: [deploy] }, "acme/web", "https://spooky.example", { claims: [claim], viewerKeyId: "k2" });
    expect(mine).toContain("Claimed: by you");
  });
});
