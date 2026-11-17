import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/actor";

const state = vi.hoisted(() => ({ responses: [] as unknown[][], values: [] as unknown[], audit: vi.fn(), admin: vi.fn(), catches: vi.fn() }));
vi.mock("@/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/db")>();
  const chain = (): Record<string, unknown> => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "from", "where", "orderBy", "limit", "insert", "returning", "onConflictDoNothing", "update", "set"]) query[method] = () => query;
    query.values = (value: unknown) => { state.values.push(value); return query; };
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(state.responses.shift() ?? []).then(resolve, reject);
    return query;
  };
  return { ...original, getDb: () => chain() };
});
vi.mock("@/lib/audit", () => ({ appendAudit: (...args: unknown[]) => state.audit(...args) }));
vi.mock("@/lib/analytics/usage", () => ({ isAdmin: (...args: unknown[]) => state.admin(...args) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/catches", () => ({ catchesFor: (...args: unknown[]) => state.catches(...args) }));

const { createPost, listPosts, markWorked, moderate, publicTips, canReadPost, ForumLimitError } = await import("./store");
const actor = (userId: string): Actor => ({ userId, via: "api_key", scopes: ["read", "write"], label: `user:${userId}` });
const id = "11111111-1111-4111-8111-111111111111";
const row = (overrides: Record<string, unknown> = {}) => ({ id, userId: "owner", kind: "tip" as const, title: "Export GET", body: "A cron route needs GET.", agent: "Codex", incidentId: null, confirmedFix: false, status: "approved" as const, holdReason: null, answer: null, answeredAt: null, createdAt: new Date("2026-11-16T10:00:00Z"), updatedAt: new Date("2026-11-16T10:00:00Z"), ...overrides });

beforeEach(() => {
  state.responses = [];
  state.values = [];
  state.audit.mockReset().mockResolvedValue(undefined);
  state.admin.mockReset().mockResolvedValue(false);
  state.catches.mockReset().mockResolvedValue({ catches: [] });
});

describe("forum store", () => {
  it("keeps another account's feedback and unapproved tips out of reads", async () => {
    const feedback = row({ kind: "feedback", status: "open", userId: "other" });
    const pending = row({ status: "pending", userId: "other" });
    const held = row({ status: "held", userId: "other" });
    expect(canReadPost(feedback, "viewer")).toBe(false);
    expect(canReadPost(pending, "viewer")).toBe(false);
    expect(canReadPost(held, "viewer")).toBe(false);
    state.responses.push([{ post: feedback, worked: 0 }, { post: pending, worked: 0 }, { post: held, worked: 0 }, { post: row(), worked: 2 }]);
    const result = await listPosts(actor("viewer"));
    expect(result.untrusted).toBe(true);
    expect(result.posts).toEqual([{ id, title: "Export GET", body: "A cron route needs GET.", agent: "Codex", confirmedFix: false, worked: 2, createdAt: "2026-11-16T10:00:00.000Z" }]);
    expect(JSON.stringify(result)).not.toContain("owner");
  });

  it("shows an owner their feedback and answer", async () => {
    state.responses.push([{ post: row({ kind: "feedback", status: "answered", answer: "We shipped it.", answeredAt: new Date("2026-11-16T11:00:00Z") }), worked: 0 }]);
    const result = await listPosts(actor("owner"), { kind: "feedback" });
    expect(result.posts[0]).toMatchObject({ kind: "feedback", status: "answered", answer: "We shipped it." });
  });

  it("never publishes pending or held tips", async () => {
    state.responses.push([{ post: row({ status: "pending" }), worked: 0 }, { post: row({ status: "held" }), worked: 0 }, { post: row(), worked: 3 }]);
    expect(await publicTips()).toHaveLength(1);
  });

  it("refuses secrets without echoing them or writing a post", async () => {
    const secret = `sk-${"aB3_".repeat(8)}`;
    await expect(createPost(actor("owner"), { kind: "tip", title: "Tip", body: secret })).rejects.toMatchObject({ status: 422, code: "private_data" });
    try { await createPost(actor("owner"), { kind: "tip", title: "Tip", body: secret }); } catch (error) { expect(String(error)).not.toContain(secret); }
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("refuses an own repo name", async () => {
    state.responses.push([{ name: "owner/private-repo" }]);
    await expect(createPost(actor("owner"), { kind: "tip", title: "Tip", body: "owner/private-repo needed GET" })).rejects.toMatchObject({ status: 422, code: "project_name" });
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("enforces five posts in a rolling day", async () => {
    state.responses.push([], [{ count: 5, oldest: new Date(Date.now() - 1000) }]);
    await expect(createPost(actor("owner"), { kind: "tip", title: "Tip", body: "Export GET." })).rejects.toBeInstanceOf(ForumLimitError);
  });

  it("creates private feedback, audits metadata only, and marks suspicious tips held", async () => {
    state.responses.push([], [{ count: 0, oldest: null }], [row({ kind: "feedback", status: "open", body: "A private note" })]);
    expect(await createPost(actor("owner"), { kind: "feedback", title: "Help", body: "A private note" })).toMatchObject({ kind: "feedback", status: "open" });
    expect(state.values[0]).toMatchObject({ kind: "feedback", status: "open" });
    expect(JSON.stringify(state.audit.mock.calls)).not.toContain("A private note");
    state.responses.push([], [{ count: 0, oldest: null }], [row({ status: "held" })]);
    await createPost(actor("owner"), { kind: "tip", title: "Tip", body: "See https://example.com/guide" });
    expect(state.values[1]).toMatchObject({ kind: "tip", status: "held", holdReason: "URL" });
  });

  it("marks a linked incident confirmed only after Spooky confirmed it", async () => {
    state.catches.mockResolvedValueOnce({ catches: [{ id: "incident-a", confirmedAt: "2026-11-16T09:00:00Z" }] });
    state.responses.push([], [{ count: 0, oldest: null }], [row({ incidentId: "incident-a", confirmedFix: true })]);
    await createPost(actor("owner"), { kind: "tip", title: "Tip", body: "Export GET.", incidentId: "incident-a" });
    expect(state.values[0]).toMatchObject({ incidentId: "incident-a", confirmedFix: true });
  });

  it("rejects own and unapproved worked marks", async () => {
    state.responses.push([{ userId: "owner", kind: "tip", status: "approved" }]);
    await expect(markWorked(actor("owner"), id)).rejects.toMatchObject({ status: 403, code: "own_tip" });
    state.responses.push([{ userId: "owner", kind: "tip", status: "pending" }]);
    await expect(markWorked(actor("viewer"), id)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects duplicate worked marks and the daily limit", async () => {
    state.responses.push([{ userId: "owner", kind: "tip", status: "approved" }], [{ postId: id }]);
    await expect(markWorked(actor("viewer"), id)).rejects.toMatchObject({ status: 409 });
    state.responses.push([{ userId: "owner", kind: "tip", status: "approved" }], [], [{ count: 30, oldest: new Date(Date.now() - 1000) }]);
    await expect(markWorked(actor("viewer"), id)).rejects.toBeInstanceOf(ForumLimitError);
  });

  it("records one worked mark for another account", async () => {
    state.responses.push([{ userId: "owner", kind: "tip", status: "approved" }], [], [{ count: 0, oldest: null }], [{ postId: id }]);
    expect(await markWorked(actor("viewer"), id)).toEqual({ worked: true });
    expect(state.values[0]).toEqual({ postId: id, userId: "viewer" });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "forum.worked", target: id }));
  });

  it("lets a write key hide a tip but only a person or a full control key approve one", async () => {
    state.admin.mockResolvedValue(true);
    await expect(moderate(actor("admin"), id, { status: "approved" })).rejects.toMatchObject({ status: 403, code: "approve_scope" });
    state.responses.push([row({ status: "pending" })], [row({ status: "hidden" })]);
    expect(await moderate(actor("admin"), id, { status: "hidden" })).toMatchObject({ status: "hidden" });
    state.responses.push([row({ status: "pending" })], [row({ status: "approved" })]);
    expect(await moderate({ ...actor("admin"), scopes: ["read", "write", "approve"] }, id, { status: "approved" })).toMatchObject({ status: "approved" });
    state.responses.push([row({ status: "pending" })], [row({ status: "approved" })]);
    expect(await moderate({ ...actor("admin"), via: "session" }, id, { status: "approved" })).toMatchObject({ status: "approved" });
  });
});
