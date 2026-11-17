import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";

vi.mock("next/server", () => ({ connection: async () => undefined }));
const actor = vi.fn();
const create = vi.fn();
const list = vi.fn();
const worked = vi.fn();
const queue = vi.fn();
const moderate = vi.fn();
vi.mock("@/lib/require-actor", () => ({ requireActor: (...args: unknown[]) => actor(...args) }));
vi.mock("@/lib/forum/store", () => ({
  ForumLimitError: class extends ApiError { retryAfterSeconds = 60; constructor() { super(429, "rate_limited", "Wait before posting."); } },
  createPost: (...args: unknown[]) => create(...args), listPosts: (...args: unknown[]) => list(...args),
  markWorked: (...args: unknown[]) => worked(...args), queue: (...args: unknown[]) => queue(...args), moderate: (...args: unknown[]) => moderate(...args),
}));

const posts = await import("@/app/api/v1/forum/posts/route");
const workedRoute = await import("@/app/api/v1/forum/posts/[id]/worked/route");
const queueRoute = await import("@/app/api/v1/forum/queue/route");
const moderateRoute = await import("@/app/api/v1/forum/posts/[id]/route");
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };

beforeEach(() => {
  actor.mockReset().mockResolvedValue({ userId: "a", label: "a", scopes: ["read", "write"] });
  for (const fn of [create, list, worked, queue, moderate]) fn.mockReset().mockResolvedValue({ posts: [] });
});

it("uses read scope for lists and queue, write scope for changes", async () => {
  await posts.GET(new Request("http://localhost/api/v1/forum/posts"), undefined);
  await queueRoute.GET(new Request("http://localhost/api/v1/forum/queue"), undefined);
  await posts.POST(new Request("http://localhost/api/v1/forum/posts", { method: "POST", body: "{}" }), undefined);
  await workedRoute.POST(new Request(`http://localhost/api/v1/forum/posts/${id}/worked`, { method: "POST" }), ctx);
  await moderateRoute.PATCH(new Request(`http://localhost/api/v1/forum/posts/${id}`, { method: "PATCH", body: "{}" }), ctx);
  expect(actor.mock.calls.map((call) => call[1])).toEqual(["read", "read", "write", "write", "write"]);
});

it("returns a safe 422 without echoing a secret", async () => {
  const secret = `sk-${"aB3_".repeat(8)}`;
  create.mockRejectedValueOnce(new ApiError(422, "private_data", "Remove API key or token before posting."));
  const response = await posts.POST(new Request("http://localhost/api/v1/forum/posts", { method: "POST", body: JSON.stringify({ kind: "tip", title: "Tip", body: secret }) }), undefined);
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain(secret);
});

it("returns a retry-after header for a daily limit", async () => {
  const { ForumLimitError } = await import("@/lib/forum/store");
  create.mockRejectedValueOnce(new ForumLimitError(60, "post"));
  const response = await posts.POST(new Request("http://localhost/api/v1/forum/posts", { method: "POST", body: "{}" }), undefined);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
});
