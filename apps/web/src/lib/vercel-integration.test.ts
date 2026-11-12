import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauth-state";
import { buildVercelExchangeRequest, parseVercelExchangeResponse } from "./providers/vercel-oauth";
import { INTEGRATION_READS_REQUEST_HISTORY, integrationScopes, pastedAccountId, retireCoveredTokens, retireDecision, tokenRetirementEvidence, upgradeTarget } from "./vercel-integration";
import { createPendingInstall, safeVercelNext, verifyPendingInstall } from "./vercel-integration-state";

beforeAll(() => { process.env.SP_MASTER_KEY = randomBytes(32).toString("base64"); });

describe("Vercel installation state", () => {
  it("binds a short-lived install to the signed-in user and the returned state", () => {
    const created = createOAuthState("u1", "vercel-integration");
    expect(verifyOAuthState(created.cookieValue, created.state, "u1", "vercel-integration")).toBeTruthy();
    expect(verifyOAuthState(created.cookieValue, created.state, "u2", "vercel-integration")).toBeNull();
    expect(verifyOAuthState(created.cookieValue, "wrong", "u1", "vercel-integration")).toBeNull();
    expect(verifyOAuthState(created.cookieValue, created.state, "u1", "github")).toBeNull();
  });

  it("seals a Vercel-side code for the sign-in bounce and expires it", () => {
    const pending = createPendingInstall("?code=once&configurationId=icfg_1", 1000);
    expect(pending).not.toContain("once");
    expect(verifyPendingInstall(pending, 2000)).toBe("?code=once&configurationId=icfg_1");
    expect(verifyPendingInstall(pending, 1000 + 25 * 60_000 + 1)).toBeNull();
  });
});

describe("Vercel code exchange", () => {
  it("builds the documented form POST without making a request", () => {
    const { url, init } = buildVercelExchangeRequest({ clientId: "client", clientSecret: "secret", code: "a+b", redirectUri: "https://spookyparticles.com/api/connect/vercel/callback" });
    expect(url).toBe("https://api.vercel.com/v2/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ client_id: "client", client_secret: "secret", code: "a+b", redirect_uri: "https://spookyparticles.com/api/connect/vercel/callback" });
  });

  it("parses both team and personal fixtures and rejects malformed tokens", () => {
    const fixture = { token_type: "Bearer", access_token: "token", installation_id: "inst_1", user_id: "u1", team_id: "team_1" };
    expect(parseVercelExchangeResponse(fixture)).toEqual(fixture);
    expect(parseVercelExchangeResponse({ ...fixture, team_id: null }).team_id).toBeNull();
    expect(() => parseVercelExchangeResponse({ ...fixture, access_token: "" })).toThrow();
  });
});

it("allows only https URLs on Vercel", () => {
  expect(safeVercelNext("https://vercel.com/integrations/test?done=1")).toBe("https://vercel.com/integrations/test?done=1");
  expect(safeVercelNext("https://foo.vercel.com/path")).toBe("https://foo.vercel.com/path");
  for (const bad of ["http://vercel.com", "https://vercel.com.evil.test", "https://evil.test", "javascript:alert(1)", "//vercel.com", "https://user@vercel.com"]) expect(safeVercelNext(bad)).toBeNull();
});

it("upgrades only an existing integration and keeps pasted tokens separate", () => {
  const install = { via: "integration" as const, installationId: "inst_1", configurationId: "icfg_1", teamId: "team_1" };
  const rows = [
    { id: "pasted", externalAccountId: "user:u1", scopes: ["projects:read"] },
    { id: "installed", externalAccountId: "team:team_1", scopes: integrationScopes(install) },
    { id: "opaque", externalAccountId: "scoped:123", scopes: ["projects:read"] },
  ];
  expect(upgradeTarget(rows, "user:u1", "new-config")).toBeNull();
  expect(upgradeTarget(rows, "team:team_1", "icfg_1")).toBe("installed");
  expect(upgradeTarget(rows, "team:other", "icfg_1")).toBe("installed");
  expect(upgradeTarget(rows, "team:other", "other-config")).toBeNull();
});

it("reuses legacy pasted rows without overwriting legacy installs", () => {
  const install = integrationScopes({ via: "integration", installationId: "i", configurationId: "c", teamId: null });
  expect(pastedAccountId("user:u1", [{ externalAccountId: "user:u1", scopes: [] }])).toBe("user:u1");
  expect(pastedAccountId("user:u1", [{ externalAccountId: "user:u1", scopes: install }])).toBe("pasted:user:u1");
});

describe("install display placeholder", () => {
  it("recognises the placeholders and nothing a person would have typed", async () => {
    const { isPlaceholderDisplay } = await import("./vercel-integration");
    expect(isPlaceholderDisplay("Vercel team team_example")).toBe(true);
    expect(isPlaceholderDisplay("Vercel personal account")).toBe(true);
    expect(isPlaceholderDisplay("n8peaces-projects")).toBe(false);
    expect(isPlaceholderDisplay("Vercel team")).toBe(false);
  });
});

describe("retiring a covered pasted token", () => {
  it("keeps retirement disabled while integrations cannot read request history", async () => {
    expect(INTEGRATION_READS_REQUEST_HISTORY).toBe(false);
    expect(await retireCoveredTokens({ userId: "u", installRowId: "i", installTeamId: "t", installUserId: "u", proofProjectId: "p" })).toBe(0);
  });
  it.each([
    [false, false, "keep"],
    [false, true, "keep"],
    [true, false, "retire"],
    [true, true, "keep"],
  ] as const)("covers=%s readsElsewhere=%s => %s", (covers, readsElsewhere, expected) => {
    expect(retireDecision({ covers, readsElsewhere })).toBe(expected);
  });

  it("keeps a full-account token when its personal account has projects", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}${url.search}`);
      const body = url.pathname === "/v2/user" ? { user: { id: "u1", username: "person" } }
        : url.pathname === "/v2/teams" ? { teams: [{ id: "team_1", slug: "team", name: "Team" }] }
        : { projects: [{ id: "p1" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
      expect(await tokenRetirementEvidence("pasted", "team_1", "u1", "p1")).toEqual({ covers: true, readsElsewhere: true });
      expect(calls).toContain("/v10/projects/p1?teamId=team_1");
      expect(calls).toContain("/v10/projects?limit=1");
    } finally { globalThis.fetch = original; }
  });

  it("retires only when the installed team is the sole scope with projects", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname === "/v2/user" ? { user: { id: "u1", username: "person" } }
        : url.pathname === "/v2/teams" ? { teams: [{ id: "team_1", slug: "team", name: "Team" }] }
        : { projects: url.searchParams.has("teamId") ? [{ id: "p1" }] : [] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
      const evidence = await tokenRetirementEvidence("pasted", "team_1", "u1", "p1");
      expect(evidence).toEqual({ covers: true, readsElsewhere: false });
      expect(retireDecision(evidence)).toBe("retire");
    } finally { globalThis.fetch = original; }
  });

  it("keeps the token if checking another scope fails", async () => {
    const original = globalThis.fetch;
    let personalReads = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v10/projects" && !url.searchParams.has("teamId") && ++personalReads > 1) {
        return new Response(null, { status: 503 });
      }
      const body = url.pathname === "/v2/user" ? { user: { id: "u1", username: "person" } }
        : url.pathname === "/v2/teams" ? { teams: [{ id: "team_1", slug: "team", name: "Team" }] }
        : { projects: [{ id: "p1" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
      expect(await tokenRetirementEvidence("pasted", "team_1", "u1", "p1")).toEqual({ covers: true, readsElsewhere: true });
    } finally { globalThis.fetch = original; }
  });
});
