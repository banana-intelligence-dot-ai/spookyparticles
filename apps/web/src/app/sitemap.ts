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
  { path: "/vibeops", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-deployment-failed", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/vercel-error-log", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-deployment-notifications", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-alerts", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-24" },
  { path: "/vercel-build-failed", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-build-timeout-and-out-of-memory", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-24" },
  { path: "/vercel-500-internal-server-error", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-function-timeout", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-502-bad-gateway", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-deployment-stuck", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-deployment-errors", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/claude-code-vercel", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-module-not-found", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-commit-author-is-required", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-404-not-found", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-21" },
  { path: "/vercel-monitoring", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-uptime-monitoring", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/vercel-cron-job-monitoring", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-19" },
  { path: "/cron-job-monitoring-tool-for-vercel", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-cron-job-not-running", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/vercel-deployment-failed-github", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/vercel-env-var-not-found-build", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-18" },
  { path: "/automate-fixes", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-20" },
  { path: "/automatic-bug-fixing-vercel", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
  { path: "/codex-vercel-deploy", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-22" },
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
