/**
 * POST /api/v1/help: the in-app help assistant. Session or API key, read scope.
 * Body: { messages: [{ role: "user" | "assistant", content }] }, last 10 kept,
 * 2,000 characters each. Answers { answer, links }. Limited per user to 5 a
 * minute and 30 a day. The question text is never logged.
 */
import { HelpLimitError, helpFor } from "@/lib/help/ask";
import { ApiError, api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const maxDuration = 60;

export const POST = api(async (req) => {
  const actor = await requireActor(req, "read");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_body", "Send JSON with a messages list.");
  }
  try {
    return json(await helpFor(actor.userId, body));
  } catch (err) {
    if (err instanceof HelpLimitError) {
      return json(
        { error: { code: err.code, message: err.message } },
        { status: 429, headers: { "retry-after": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }
});
