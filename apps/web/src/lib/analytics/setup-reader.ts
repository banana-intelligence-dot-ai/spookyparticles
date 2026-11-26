export type SetupReader = "agent" | "browser" | "bot";

/** Reduce a user-agent header to a non-identifying class before recording it. */
export function classifySetupReader(userAgent: string | null): SetupReader {
  const ua = userAgent?.trim() ?? "";
  if (/bot|crawler|spider|slurp|monitor|uptime|healthcheck|pingdom|statuscake|facebookexternalhit/i.test(ua)) return "bot";
  if (/mozilla/i.test(ua) && /(chrome|safari|firefox)/i.test(ua)) return "browser";
  return "agent";
}
