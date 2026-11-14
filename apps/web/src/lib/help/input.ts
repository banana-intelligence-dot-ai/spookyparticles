/**
 * Caps what a help request may send to the model: the last 10 turns, 2,000
 * characters each, starting with a person's turn and ending with one.
 * Anything malformed is a 400 before a model is called.
 */
import { ApiError } from "@/lib/http";

export const HELP_MAX_MESSAGES = 10;
export const HELP_MAX_CHARS = 2_000;

export type HelpMessage = { role: "user" | "assistant"; content: string };

export function capMessages(body: unknown): HelpMessage[] {
  const raw = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { messages?: unknown }).messages : undefined;
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, "invalid_body", "Send messages: a list of { role, content }.");
  const clean: HelpMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) throw new ApiError(400, "invalid_body", "Each message needs a role and content.");
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") throw new ApiError(400, "invalid_body", "A message role must be user or assistant.");
    if (typeof content !== "string") throw new ApiError(400, "invalid_body", "A message content must be text.");
    clean.push({ role, content });
  }
  let kept = clean.slice(-HELP_MAX_MESSAGES).map((m) => ({ role: m.role, content: m.content.trim().slice(0, HELP_MAX_CHARS) }));
  // The model's history must open with a person's turn.
  while (kept.length && kept[0].role !== "user") kept = kept.slice(1);
  const last = kept.at(-1);
  if (!last || last.role !== "user") throw new ApiError(400, "invalid_body", "The last message must be your question.");
  if (!last.content) throw new ApiError(400, "invalid_body", "Type a question first.");
  // An empty earlier turn adds nothing; drop it rather than fail the question.
  return kept.filter((m) => m.content.length > 0);
}
