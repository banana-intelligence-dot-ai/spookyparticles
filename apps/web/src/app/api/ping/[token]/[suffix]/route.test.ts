import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
const recordPing = vi.fn();
vi.mock("@/lib/checkins", () => ({ recordPing: (...a: unknown[]) => recordPing(...a), cleanCount: () => null }));

import { pingSuffixKind } from "@/lib/ping-handler";
import { GET, POST } from "./route";

const TOKEN = "tok_secret_123";
const saved = { ok: true, job: { name: "Nightly backup", status: "up", nextDueAt: null }, recovered: false };
const get = (suffix: string) => GET(new Request(`https://x.test/api/ping/${TOKEN}/${suffix}`), { params: Promise.resolve({ token: TOKEN, suffix }) });

afterEach(() => { recordPing.mockReset(); });

describe("healthchecks-style endings", () => {
  it("maps start, fail and exit codes", () => {
    expect(pingSuffixKind("start")).toEqual({ kind: "start", note: null });
    expect(pingSuffixKind("FAIL")).toEqual({ kind: "fail", note: null });
    expect(pingSuffixKind("0")).toEqual({ kind: "ok", note: null });
    expect(pingSuffixKind("2")).toEqual({ kind: "fail", note: "exit code 2" });
    expect(pingSuffixKind("256")).toBeNull();
    expect(pingSuffixKind("log")).toBeNull();
  });

  it("records /start and /1 with the right kind and note", async () => {
    recordPing.mockResolvedValue(saved);
    expect((await get("start")).status).toBe(200);
    expect(recordPing.mock.calls[0].slice(0, 3)).toEqual([TOKEN, "start", null]);
    await get("1");
    expect(recordPing.mock.calls[1].slice(0, 3)).toEqual([TOKEN, "fail", "exit code 1"]);
  });

  it("keeps a POSTed note over the exit-code note", async () => {
    recordPing.mockResolvedValue(saved);
    await POST(new Request(`https://x.test/api/ping/${TOKEN}/3`, { method: "POST", body: "disk full" }), { params: Promise.resolve({ token: TOKEN, suffix: "3" }) });
    expect(recordPing.mock.calls[0].slice(0, 3)).toEqual([TOKEN, "fail", "disk full"]);
  });

  it("keeps the first 2,000 characters of a long POSTed note", async () => {
    recordPing.mockResolvedValue(saved);
    await POST(new Request(`https://x.test/api/ping/${TOKEN}/fail`, { method: "POST", body: "x".repeat(5_000) }), { params: Promise.resolve({ token: TOKEN, suffix: "fail" }) });
    expect(recordPing.mock.calls[0][2]).toBe("x".repeat(2_000));
  });

  it("answers 404 for an unknown ending and records nothing", async () => {
    const res = await get("log");
    expect(res.status).toBe(404);
    expect(recordPing).not.toHaveBeenCalled();
  });
});
