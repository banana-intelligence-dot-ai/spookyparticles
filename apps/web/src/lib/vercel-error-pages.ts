/**
 * The Vercel error answer pages, linked from the home page so search engines find them.
 * A new page in src/app/vercel-* goes here with a short label; a test fails until it does.
 */
export const VERCEL_ERROR_PAGES: readonly { slug: string; label: string }[] = [
  { slug: "vercel-deployment-failed", label: "Deploy failed" },
  { slug: "vercel-build-failed", label: "Build failed" },
  { slug: "vercel-deployment-failed-github", label: "Failed from GitHub" },
  { slug: "vercel-env-var-not-found-build", label: "Env var not found" },
  { slug: "vercel-cron-job-monitoring", label: "Cron job monitoring" },
  { slug: "vercel-root-directory-does-not-exist", label: "Root Directory missing" },
];
