import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";

vi.mock("next/server", () => ({ connection: async () => undefined }));
const requireActor = vi.fn();
vi.mock("@/lib/require-actor", () => ({ requireActor: (...args: unknown[]) => requireActor(...args) }));
const marketingFor = vi.fn();
const setMarketing = vi.fn();
vi.mock("@/lib/marketing", () => ({
  marketingFor: (...args: unknown[]) => marketingFor(...args),
  setMarketing: (...args: unknown[]) => setMarketing(...args),
}));

const { GET, PUT } = await import("./route");

const url = "http://localhost/api/v1/me/marketing";
const get = () => GET(new Request(url), undefined);
const put = (body: unknown, raw?: string) =>
  PUT(new Request(url, { method: "PUT", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) }), undefined);
const actor = { userId: "user-1", via: "session", scopes: ["read", "write", "approve"], label: "user:user-1" };
const state = (optedIn: boolean) => ({
  email: "me@example.com",
  optedIn,
  answered: true,
  optInAt: optedIn ? "2026-11-17T12:00:00.000Z" : null,
  optOutAt: optedIn ? null : "2026-11-17T12:00:00.000Z",
});

beforeEach(() => {
  requireActor.mockReset();
  requireActor.mockResolvedValue(actor);
  marketingFor.mockReset();
  setMarketing.mockReset();
});

describe("GET /api/v1/me/marketing", () => {
  it("reads only the caller's own row with the read scope", async () => {
    marketingFor.mockResolvedValue({ email: "me@example.com", optedIn: false, answered: false, optInAt: null, optOutAt: null });
    const res = await get();
    expect(res.status).toBe(200);
    expect(requireActor.mock.calls[0][1]).toBe("read");
    expect(marketingFor).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual({ email: "me@example.com", optedIn: false, answered: false, optInAt: null, optOutAt: null });
  });

  it("answers 401 when signed out", async () => {
    requireActor.mockRejectedValue(new ApiError(401, "unauthenticated", "Sign in or send an API key"));
    expect((await get()).status).toBe(401);
    expect(marketingFor).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/me/marketing", () => {
  it("needs the write scope and passes the answer for the caller", async () => {
    setMarketing.mockResolvedValue(state(true));
    const res = await put({ optIn: true });
    expect(res.status).toBe(200);
    expect(requireActor.mock.calls[0][1]).toBe("write");
    expect(setMarketing).toHaveBeenCalledWith(actor, true);
    expect((await res.json()).optedIn).toBe(true);
  });

  it("records a no", async () => {
    setMarketing.mockResolvedValue(state(false));
    expect((await put({ optIn: false })).status).toBe(200);
    expect(setMarketing).toHaveBeenCalledWith(actor, false);
  });

  it("refuses a read-only key without saving", async () => {
    requireActor.mockRejectedValue(new ApiError(403, "insufficient_scope", 'This key lacks the "write" scope'));
    expect((await put({ optIn: true })).status).toBe(403);
    expect(setMarketing).not.toHaveBeenCalled();
  });

  it("answers 400 for bad JSON or a non-boolean", async () => {
    expect((await put(null, "{nope")).status).toBe(400);
    expect((await put({ optIn: "yes" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect(setMarketing).not.toHaveBeenCalled();
  });
});
