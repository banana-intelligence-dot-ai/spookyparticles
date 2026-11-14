/**
 * The help assistant. One function for the REST route and the MCP tool:
 * cap the input, apply the per-user limit, then a short tool loop on Sonnet
 * with read-only tools bound to the caller. Nothing here logs message text.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, apiReason } from "@/lib/extract/claude";
import { ApiError } from "@/lib/http";
import { setupMarkdown } from "@/lib/setup-markdown";
import { helpData } from "./data";
import { capMessages, type HelpMessage } from "./input";
import { createHelpLimiter, limitMessage } from "./limits";
import { linksFrom, plainDashes, type HelpLink } from "./links";
import { OFF_TOPIC_LINE, buildSystemPrompt } from "./prompt";
import { HELP_TOOLS, runHelpTool, scrubText, type HelpData } from "./tools";

export const HELP_MODEL = "claude-sonnet-5-5";
export const HELP_MAX_TOKENS = 800;
/** Up to three rounds of tool calls, then one round that must answer. */
const MAX_ROUNDS = 4;
/** Per model call. A help answer that takes longer is not worth the wait. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Across the loop; the route's maxDuration is 60 s. */
const TOTAL_BUDGET_MS = 45_000;

export type HelpAnswer = { answer: string; links: HelpLink[] };

export type HelpDeps = {
  client: () => Pick<Anthropic, "beta">;
  data: HelpData;
  setup: () => string;
  now: () => number;
};

const UNSURE = "I could not finish that answer. Try a shorter question, or read the setup guide at /setup.md.";

let cached: { setup: string; prompt: string } | null = null;
function systemFor(setup: string): string {
  if (cached?.setup !== setup) cached = { setup, prompt: buildSystemPrompt(setup) };
  return cached.prompt;
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
}

function finish(text: string): HelpAnswer {
  const answer = plainDashes(scrubText(text)).trim() || UNSURE;
  return { answer, links: linksFrom(answer) };
}

/** The model loop for already capped messages. Throws ApiError(502) when the model cannot be reached. */
export async function askHelp(userId: string, messages: HelpMessage[], deps: HelpDeps): Promise<HelpAnswer> {
  const system = systemFor(deps.setup());
  const convo: Anthropic.Beta.BetaMessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const started = deps.now();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const mustAnswer = round === MAX_ROUNDS - 1 || deps.now() - started > TOTAL_BUDGET_MS - REQUEST_TIMEOUT_MS;
    let m: Anthropic.Beta.BetaMessage;
    try {
      m = await deps.client().beta.messages.create(
        {
          model: HELP_MODEL,
          max_tokens: HELP_MAX_TOKENS,
          // A refusal is retried on a fallback model inside the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools: HELP_TOOLS,
          tool_choice: mustAnswer ? { type: "none" } : { type: "auto" },
          messages: convo,
        },
        { timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 },
      );
    } catch (err) {
      // The reason names the failure class only; never the question.
      console.error("[help] model call failed", apiReason(err));
      throw new ApiError(502, "help_unavailable", "Help is not available right now. Try again in a minute, or read /setup.md.");
    }
    if (m.stop_reason === "refusal") return finish(OFF_TOPIC_LINE);
    if (m.stop_reason !== "tool_use") return finish(textOf(m.content));
    // Pass the whole turn back unchanged (thinking and fallback blocks included).
    convo.push({ role: "assistant", content: m.content });
    const calls = m.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results = await Promise.all(calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      const r = await runHelpTool(call.name, call.input, userId, deps.data);
      return { type: "tool_result", tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
    }));
    convo.push({ role: "user", content: results });
  }
  return finish(UNSURE);
}

const allow = createHelpLimiter();

/** Shared by POST /api/v1/help and the MCP help tool: validate, limit, answer. */
export async function helpFor(userId: string, body: unknown, deps?: Partial<HelpDeps> & { allow?: typeof allow }): Promise<HelpAnswer> {
  const messages = capMessages(body);
  const limit = (deps?.allow ?? allow)(userId);
  if (!limit.ok) throw new HelpLimitError(limitMessage(limit), limit.retryAfterSeconds);
  return askHelp(userId, messages, {
    client: deps?.client ?? anthropic,
    data: deps?.data ?? helpData,
    setup: deps?.setup ?? setupMarkdown,
    now: deps?.now ?? Date.now,
  });
}

export class HelpLimitError extends ApiError {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(429, "rate_limited", message);
  }
}
