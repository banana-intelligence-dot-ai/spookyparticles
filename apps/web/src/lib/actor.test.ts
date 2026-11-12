import { describe, expect, it, vi } from "vitest";
import { createRequireActor, isKeyUsable, type ActorDeps } from "./actor";
import { sha256Hex } from "./crypto";
import { ApiError } from "./http";

const KEY = "sp_live_example_key";

function deps(overrides: Partial<ActorDeps> = {}): ActorDeps {
  return {
    getSessionUserId: vi.fn(async () => null),
    findApiKeyByHash: vi.fn(async (hash: string) =>
      hash === sha256Hex(KEY)
        ? { id: "key1", userId: "u_key", scopes: ["read" as const], revokedAt: null, expiresAt: null }
        : null,
    ),
    touchApiKey: vi.fn(async () => undefined),
    ...overrides,
  };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/me", { headers });

async function expectApiError(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(status);
  expect(err.code).toBe(code);
}

describe("requireActor", () => {
  it("checks key expiry against the supplied clock", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(isKeyUsable({ revokedAt: null, expiresAt: new Date("2026-11-13T00:00:00Z") }, now)).toBe(true);
    expect(isKeyUsable({ revokedAt: null, expiresAt: new Date("2026-11-12T00:00:00Z") }, now)).toBe(false);
  });

  it("resolves a session user with every scope", async () => {
    const d = deps({ getSessionUserId: vi.fn(async () => "u_session") });
    const actor = await createRequireActor(d)(req(), "approve");
    expect(actor).toMatchObject({ userId: "u_session", via: "session", label: "user:u_session" });
    expect(actor.scopes).toEqual(["read", "write", "approve"]);
  });

  it("rejects a request with neither session nor key", async () => {
    await expectApiError(createRequireActor(deps())(req()), 401, "unauthenticated");
  });

  it("resolves an API key by its hash, never the raw key", async () => {
    const d = deps();
    const actor = await createRequireActor(d)(req({ authorization: `Bearer ${KEY}` }));
    expect(actor).toMatchObject({ userId: "u_key", via: "api_key", apiKeyId: "key1" });
    expect(d.findApiKeyByHash).toHaveBeenCalledWith(sha256Hex(KEY));
    expect(d.touchApiKey).toHaveBeenCalledWith("key1");
    expect(d.getSessionUserId).not.toHaveBeenCalled();
  });

  it("prefers the API key over a session when both are present", async () => {
    const d = deps({ getSessionUserId: vi.fn(async () => "u_session") });
    const actor = await createRequireActor(d)(req({ authorization: `Bearer ${KEY}` }));
    expect(actor.userId).toBe("u_key");
  });

  it("rejects unknown keys and malformed headers", async () => {
    const ra = createRequireActor(deps());
    await expectApiError(ra(req({ authorization: "Bearer sp_nope" })), 401, "invalid_api_key");
    await expectApiError(ra(req({ authorization: "Bearer ghp_wrongprefix" })), 401, "invalid_api_key");
    await expectApiError(ra(req({ authorization: "Basic abc" })), 401, "invalid_api_key");
  });

  it("rejects revoked keys", async () => {
    const d = deps({
      findApiKeyByHash: vi.fn(async () => ({ id: "k", userId: "u", scopes: ["read" as const], revokedAt: new Date(), expiresAt: null })),
    });
    await expectApiError(createRequireActor(d)(req({ authorization: `Bearer ${KEY}` })), 401, "invalid_api_key");
  });

  it("rejects expired keys", async () => {
    const d = deps({
      findApiKeyByHash: vi.fn(async () => ({ id: "k", userId: "u", scopes: ["read" as const], revokedAt: null, expiresAt: new Date("2026-11-12T00:00:00Z") })),
    });
    await expectApiError(createRequireActor(d)(req({ authorization: `Bearer ${KEY}` })), 401, "invalid_api_key");
  });

  it("enforces scope on API keys", async () => {
    await expectApiError(
      createRequireActor(deps())(req({ authorization: `Bearer ${KEY}` }), "write"),
      403,
      "insufficient_scope",
    );
  });

  it("does not fail the request when touching last_used_at fails", async () => {
    const d = deps({ touchApiKey: vi.fn(async () => Promise.reject(new Error("db down"))) });
    const actor = await createRequireActor(d)(req({ authorization: `Bearer ${KEY}` }));
    expect(actor.userId).toBe("u_key");
  });
});
