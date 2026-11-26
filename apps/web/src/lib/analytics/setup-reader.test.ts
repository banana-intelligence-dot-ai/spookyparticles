import { describe, expect, it } from "vitest";
import { classifySetupReader } from "./setup-reader";

describe("classifySetupReader", () => {
  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "GPTBot/1.2",
    "ClaudeBot/1.0",
    "PerplexityBot/1.0",
    "facebookexternalhit/1.1",
    "UptimeRobot/2.0",
  ])("classifies %s as a bot", (userAgent) => {
    expect(classifySetupReader(userAgent)).toBe("bot");
  });

  it.each([
    "Mozilla/5.0 AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 Gecko/20100101 Firefox/145.0",
    "Mozilla/5.0 Version/18.6 Safari/605.1.15",
  ])("classifies %s as a browser", (userAgent) => {
    expect(classifySetupReader(userAgent)).toBe("browser");
  });

  it.each(["curl/8.7.1", "node", "python-requests/2.32", "undici", "Claude-User", "axios/1.13", "", null])(
    "classifies %s as an agent",
    (userAgent) => {
      expect(classifySetupReader(userAgent)).toBe("agent");
    },
  );

  it("does not let a browser token override a bot token", () => {
    expect(classifySetupReader("Mozilla/5.0 Chrome/141.0 Googlebot/2.1")).toBe("bot");
  });
});
