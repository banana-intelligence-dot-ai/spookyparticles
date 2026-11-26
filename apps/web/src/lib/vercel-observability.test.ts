import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTERNAL_APIS_REFUSED_AT, REFUSAL_TTL_MS, OBSERVABILITY_REFUSED_AT } from "@/lib/vercel-refusals";
import { readProjectObservability } from "./vercel-observability";

const mocks = vi.hoisted(() => ({
  queryErrorRate: vi.fn(),
  queryExternalApis: vi.fn(),
  persistNodeRefusal: vi.fn(),
}));

vi.mock("@/lib/providers/vercel-query", () => ({
  queryErrorRate: mocks.queryErrorRate,
  queryExternalApis: mocks.queryExternalApis,
}));
vi.mock("@/lib/vercel-refusals", async (original) => ({
  ...await original(),
  persistNodeRefusal: mocks.persistNodeRefusal,
}));

const now = Date.parse("2026-11-25T12:00:00.000Z");
const scope = { kind: "team" as const, id: "team_1", slug: "team", name: "Team" };
const project = (refusals: { observability?: string; externalApis?: string } = {}) => ({
  id: "node_1",
  userId: "user_1",
  kind: "project" as const,
  externalKey: "vercel:project:prj_1",
  name: "site",
  status: "live",
  attributes: {
    ...(refusals.observability ? { [OBSERVABILITY_REFUSED_AT]: refusals.observability } : {}),
    ...(refusals.externalApis ? { [EXTERNAL_APIS_REFUSED_AT]: refusals.externalApis } : {}),
  },
});

describe("readProjectObservability refusal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryExternalApis.mockResolvedValue({ ok: true, hosts: [] });
  });

  it("records a refusal when Vercel returns 404", async () => {
    mocks.queryErrorRate.mockResolvedValue({ ok: false, reason: "not_readable", status: 404 });

    await readProjectObservability(project(), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", OBSERVABILITY_REFUSED_AT, { refused: true, read: false }, now);
  });

  it("records a separate refusal when the outside-API metric returns 404", async () => {
    mocks.queryErrorRate.mockResolvedValue({ ok: true, counts: { total: 1, serverErrors: 0 } });
    mocks.queryExternalApis.mockResolvedValue({ ok: false, reason: "not_readable", status: 404 });

    await readProjectObservability(project(), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", EXTERNAL_APIS_REFUSED_AT, { refused: true, read: false }, now);
  });

  it("does not persist 403 refusals for either observability metric", async () => {
    mocks.queryErrorRate.mockResolvedValueOnce({ ok: false, reason: "not_readable", status: 403 });

    await readProjectObservability(project(), "token", scope, "prj_1", now - 60_000, now);

    mocks.queryErrorRate.mockResolvedValueOnce({ ok: true, counts: { total: 1, serverErrors: 0 } });
    mocks.queryExternalApis.mockResolvedValueOnce({ ok: false, reason: "not_readable", status: 403 });

    await readProjectObservability(project(), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.persistNodeRefusal).not.toHaveBeenCalled();
  });

  it("makes no query while the refusal is less than 24 hours old", async () => {
    const result = await readProjectObservability(project({ observability: new Date(now - REFUSAL_TTL_MS + 1).toISOString() }), "token", scope, "prj_1", now - 60_000, now);

    expect(result).toEqual({ skipped: true });
    expect(mocks.queryErrorRate).not.toHaveBeenCalled();
    expect(mocks.queryExternalApis).not.toHaveBeenCalled();
  });

  it("retries when the refusal is 24 hours old", async () => {
    mocks.queryErrorRate.mockResolvedValue({ ok: false, reason: "unavailable" });

    await readProjectObservability(project({ observability: new Date(now - REFUSAL_TTL_MS).toISOString() }), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.queryErrorRate).toHaveBeenCalledOnce();
  });

  it("clears the refusal after both observability reads succeed", async () => {
    mocks.queryErrorRate.mockResolvedValue({ ok: true, counts: { total: 1, serverErrors: 0 } });

    await readProjectObservability(project({ observability: new Date(now - REFUSAL_TTL_MS).toISOString(), externalApis: new Date(now - REFUSAL_TTL_MS).toISOString() }), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.queryExternalApis).toHaveBeenCalledOnce();
    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", OBSERVABILITY_REFUSED_AT, { refused: false, read: true }, now);
    expect(mocks.persistNodeRefusal).toHaveBeenCalledWith("node_1", EXTERNAL_APIS_REFUSED_AT, { refused: false, read: true }, now);
  });

  it("keeps server-error reads running while an outside-API refusal is fresh", async () => {
    mocks.queryErrorRate.mockResolvedValue({ ok: true, counts: { total: 1, serverErrors: 0 } });

    await readProjectObservability(project({ externalApis: new Date(now - REFUSAL_TTL_MS + 1).toISOString() }), "token", scope, "prj_1", now - 60_000, now);

    expect(mocks.queryErrorRate).toHaveBeenCalledOnce();
    expect(mocks.queryExternalApis).not.toHaveBeenCalled();
  });
});
