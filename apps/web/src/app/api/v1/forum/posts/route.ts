import { ApiError, api, json } from "@/lib/http";
import { createPost, ForumLimitError, listPosts } from "@/lib/forum/store";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req, "read");
  const params = new URL(req.url).searchParams;
  return json(await listPosts(actor, { kind: params.get("kind") as "tip" | "feedback" | undefined ?? undefined, q: params.get("q") ?? undefined, limit: params.has("limit") ? Number(params.get("limit")) : undefined }));
});

export const POST = api(async (req) => {
  const actor = await requireActor(req, "write");
  const body = await req.json().catch(() => { throw new ApiError(400, "invalid_body", "Send JSON with a post."); });
  try { return json(await createPost(actor, body), { status: 201 }); }
  catch (err) {
    if (err instanceof ForumLimitError) return json({ error: { code: err.code, message: err.message } }, { status: 429, headers: { "retry-after": String(err.retryAfterSeconds) } });
    throw err;
  }
});
