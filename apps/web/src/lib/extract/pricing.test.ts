import { describe, expect, it } from "vitest";
import { costCents } from "./pricing";

describe("costCents", () => {
  it("prices all three token classes for each model", () => {
    expect(costCents({ model: "claude-haiku-5-5", inputTokens: 50_000, outputTokens: 100_000, cacheReadTokens: 50_000 })).toBe(6);
    expect(costCents({ model: "claude-sonnet-5-5", inputTokens: 100_000, outputTokens: 100_000, cacheReadTokens: 100_000 })).toBe(121);
    expect(costCents({ model: "claude-opus-5-5", inputTokens: 100_000, outputTokens: 100_000, cacheReadTokens: 100_000 })).toBe(242);
  });

  it("rounds a nonzero call up and charges unknown models at the highest rate", () => {
    expect(costCents({ model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 0, cacheReadTokens: 0 })).toBe(1);
    expect(costCents({ model: "unknown", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0 })).toBe(200);
    expect(costCents({ model: "unknown", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 })).toBe(0);
  });

  it("uses Haiku's long-context rate over 100,000 prompt tokens", () => {
    expect(costCents({ model: "claude-haiku-5-5", inputTokens: 100_001, outputTokens: 10_000, cacheReadTokens: 0 })).toBe(8);
  });
});
