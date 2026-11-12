import type { ModelUsage } from "./claude";

/** USD per million tokens. Source: https://platform.claude.com/docs/en/about-claude/pricing (2026-11-03). */
const PRICES = {
  "claude-haiku-5-5": { input: 0.10, output: 0.50, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.10 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.20 },
} as const;
const HAIKU_LONG_CONTEXT = { input: 0.50, output: 2.50, cacheRead: 0.05 };

/** Round each call up to a cent so a small call cannot silently bypass a cap. */
export function costCents(usage: ModelUsage): number {
  const price = usage.model === "claude-haiku-5-5" && usage.inputTokens + usage.cacheReadTokens > 100_000
    ? HAIKU_LONG_CONTEXT
    : PRICES[usage.model as keyof typeof PRICES] ?? PRICES["claude-opus-5-5"];
  return Math.ceil((usage.inputTokens * price.input + usage.outputTokens * price.output + usage.cacheReadTokens * price.cacheRead) / 10_000);
}
