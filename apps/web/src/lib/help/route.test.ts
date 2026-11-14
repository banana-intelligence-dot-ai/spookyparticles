import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";

vi.mock("next/server", () => ({ connection: async () => undefined }));
const requireActor = vi.fn();
vi.mock("@/lib/require-actor", () => ({ requireActor: (...args: unknown[]) => requireActor(...args) }));
vi.mock("@/lib/help/data", () => ({
  helpData: {
    incidents: async () => ({ checkedAt: "t", repoRefreshed: false, note: "", incidents: [] }),
    jobs: async () => [], claims: async () => [], projects: async () => ({ projects: [] }), projectPage: async () => null, connections: async () => [],
  },
}));
vi.mock("@/lib/setup-markdown", () => ({ setupMarkdown: () => "# setup" }));
const create = vi.fn();
vi.mock("@/lib/extract/claude", () => ({
  anthropic: () => ({ beta: { messages: { create } } }),
  apiReason: () => "model error",
}));

const { POST } = await import("@/app/api/v1/help/route");

const post = (body: unknown, raw?: string) =>
  POST(new Request("http://localhost/api/v1/help", { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) }), undefined);
const ask = (content = "How does the fixer work?") => post({ messages: [{ role: "user", content }] });

let n = 0;
beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "It runs on your computer. See /setup.md." }] });
  requireActor.mockReset();
  // A fresh user per test, so the in-memory limit starts full.
  const userId = `user-${++n}`;
  requireActor.mockResolvedValue({ userId, via: "session", scopes: ["read", "write", "approve"], label: `user:${userId}` });
});

describe("POST /api/v1/help", () => {
  it("answers 401 when signed out, without calling the model", async () => {
    requireActor.mockRejectedValue(new ApiError(401, "unauthenticated", "Sign in or send an API key"));
    const res = await ask();
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("asks only for the read scope", async () => {
    await ask();
    expect(requireActor.mock.calls[0][1]).toBe("read");
  });

  it("answers 400 for bad JSON or a bad body", async () => {
    expect((await post(null, "{nope")).status).toBe(400);
    expect((await post({ messages: "hi" })).status).toBe(400);
    expect((await post({ messages: [{ role: "assistant", content: "hi" }] })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("answers with answer and links", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "It runs on your computer. See /setup.md.", links: [{ label: "Setup guide", href: "/setup.md" }] });
  });

  it("answers 429 in plain words after 5 questions in a minute", async () => {
    for (let i = 0; i < 5; i++) expect((await ask()).status).toBe(200);
    const res = await ask();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toMatch(/Wait a minute/);
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("answers 502 when the model is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    create.mockRejectedValue(new Error("down"));
    const res = await ask();
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("help_unavailable");
  });
});
