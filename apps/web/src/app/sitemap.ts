import type { MetadataRoute } from "next";
import { DOCS_PAGES } from "./docs/pages";
import { HOW_PAGES } from "./how/pages";
import { listReferencePages } from "@/lib/reference-pages";

const BASE = "https://spookyparticles.com";

/**
 * Every public page. Add a line here when a "how it works" page ships. `lastModified` is the
 * day the page last changed in a way a reader would notice (ISO date); bump it with the edit.
 * Docs and how-it-works pages take it from their own `checked` date.
 */
export const PUBLIC_PAGES: {
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
  lastModified: string;
}[] = [
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: "2026-11-16" },
  { path: "/vibeops", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/vercel-deployment-failed", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/vercel-build-failed", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-19" },
  { path: "/vercel-cron-job-monitoring", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-19" },
  { path: "/vercel-deployment-failed-github", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/vercel-env-var-not-found-build", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/automate-fixes", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  ...HOW_PAGES.map((p) => ({ path: `/how/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.8, lastModified: p.checked })),
  { path: "/docs", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-17" },
  ...DOCS_PAGES.map((p) => ({ path: `/docs/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.7, lastModified: p.checked })),
  ...listReferencePages().map((p) => ({ path: `/${p.slug}`, changeFrequency: "monthly" as const, priority: 0.7, lastModified: p.checked })),
  { path: "/releases", changeFrequency: "weekly", priority: 0.6, lastModified: "2026-11-16" },
  { path: "/forum", changeFrequency: "weekly", priority: 0.5, lastModified: "2026-11-17" },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3, lastModified: "2026-11-02" },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3, lastModified: "2026-11-17" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: p.lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
