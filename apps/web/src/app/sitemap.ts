import type { MetadataRoute } from "next";
import { DOCS_PAGES } from "./docs/pages";

const BASE = "https://spookyparticles.com";

/** Every public page. Add a line here when a "how it works" page ships. */
export const PUBLIC_PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/vibeops", changeFrequency: "monthly", priority: 0.8 },
  { path: "/automate-fixes", changeFrequency: "monthly", priority: 0.8 },
  { path: "/how/apps-across-hosts-and-logins", changeFrequency: "monthly", priority: 0.8 },
  { path: "/how/email-into-an-ops-record", changeFrequency: "monthly", priority: 0.8 },
  { path: "/docs", changeFrequency: "monthly", priority: 0.8 },
  ...DOCS_PAGES.map((p) => ({ path: `/docs/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  { path: "/releases", changeFrequency: "weekly", priority: 0.6 },
  { path: "/forum", changeFrequency: "weekly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: `${BASE}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
