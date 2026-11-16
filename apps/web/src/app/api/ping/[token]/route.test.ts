import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
const recordPing = vi.fn();
vi.mock("@/lib/checkins", () => ({ recordPing: (...a: unknown[]) => recordPing(...a), cleanCount: () => null }));

import { GET } from "./route";

const TOKEN = "tok_secret_123";
const call = () => GET(new Request(`https://x.test/api/ping/${TOKEN}`), { params: Promise.resolve({ token: TOKEN }) });

afterEach(() => vi.restoreAllMocks());

describe("check-in link when Spooky cannot save", () => {
  it("answers 503 with Retry-After and never logs the token", async () => {
    const err = new Error(`Failed query: select ... params: ${TOKEN},1`, { cause: new Error(`Server error (HTTP status 402): exceeded the quota ${TOKEN}`) });
    recordPing.mockRejectedValueOnce(err);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({ ok: false, reason: "unavailable" });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("exceeded the quota");
    expect(logged).not.toContain(TOKEN);
  });

  it("still answers 200 for a saved check-in", async () => {
    recordPing.mockResolvedValueOnce({ ok: true, job: { name: "Nightly backup", status: "up", nextDueAt: null }, recovered: false });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
