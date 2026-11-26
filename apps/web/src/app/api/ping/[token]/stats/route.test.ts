import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
const recordStats = vi.fn();
vi.mock("@/lib/checkin-stats", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/checkin-stats")>()), recordStats: (...args: unknown[]) => recordStats(...args) }));

import { GET, POST } from "./route";

const token = "tok_secret_123";
const ctx = { params: Promise.resolve({ token }) };
const post = (body: string) => POST(new Request(`https://x.test/api/ping/${token}/stats`, { method: "POST", body }), ctx);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-09T14:00:00Z")); });
afterEach(() => { recordStats.mockReset(); vi.useRealTimers(); });

describe("daily number route", () => {
  it("saves valid JSON without changing a run", async () => {
    recordStats.mockResolvedValue({ ok: true, job: "App" });
    const res = await post('{"day":"2026-03-08","main":{"name":"signups","value":12}}');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, day: "2026-03-08" });
    expect(recordStats).toHaveBeenCalledWith(token, { day: "2026-03-08", mainName: "signups", mainValue: 12, mainWeek: null, counts: {} });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects bad JSON, extra fields, and a long body", async () => {
    expect((await post("{" )).status).toBe(400);
    expect((await post('{"main":{"name":"signups","value":1,"note":"text"}}')).status).toBe(400);
    expect((await post("x".repeat(4_001))).status).toBe(413);
    expect(recordStats).not.toHaveBeenCalled();
  });
  it("hides unknown tokens and reports database failures", async () => {
    recordStats.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    expect(await (await post('{"main":{"name":"signups","value":1}}')).json()).toEqual({ ok: false, reason: "unknown" });
    recordStats.mockRejectedValueOnce(new Error("database down"));
    const res = await post('{"main":{"name":"signups","value":1}}');
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });
  it("explains the POST method", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ ok: false, hint: "POST JSON to this ending" });
  });
});
