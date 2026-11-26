/**
 * The Vercel error answer pages, linked from the home page so search engines find them.
 * A new page in src/app/vercel-* goes here with a short label; a test fails until it does.
 */
export const VERCEL_ERROR_PAGES: readonly { slug: string; label: string }[] = [
  { slug: "vercel-deployment-failed", label: "Deploy failed" },
  { slug: "vercel-build-failed", label: "Build failed" },
  { slug: "vercel-build-timeout-and-out-of-memory", label: "Build limits" },
  { slug: "vercel-500-internal-server-error", label: "500 error" },
  { slug: "vercel-function-timeout", label: "Function timeout" },
  { slug: "vercel-502-bad-gateway", label: "502 bad gateway" },
  { slug: "vercel-deployment-stuck", label: "Deployment stuck" },
  { slug: "vercel-deployment-failed-github", label: "Failed from GitHub" },
  { slug: "vercel-env-var-not-found-build", label: "Env var not found" },
  { slug: "vercel-module-not-found", label: "Module not found" },
  { slug: "vercel-commit-author-is-required", label: "Commit author required" },
  { slug: "vercel-404-not-found", label: "404 NOT_FOUND" },
  { slug: "vercel-404-on-refresh", label: "404 on refresh" },
  { slug: "vercel-deployment-paused", label: "Deployment paused" },
  { slug: "vercel-cron-job-not-running", label: "Cron job not running" },
  { slug: "vercel-cron-job-monitoring", label: "Cron job monitoring" },
  { slug: "vercel-monitoring", label: "Monitoring" },
  { slug: "vercel-uptime-monitoring", label: "Uptime monitoring" },
  { slug: "vercel-deployment-notifications", label: "Deploy notifications" },
  { slug: "vercel-alerts", label: "Vercel alerts" },
  { slug: "vercel-error-log", label: "Error logs" },
  { slug: "vercel-deployment-errors", label: "Deployment errors" },
  { slug: "vercel-root-directory-does-not-exist", label: "Root Directory missing" },
];
