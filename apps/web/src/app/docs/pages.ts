/**
 * The developer docs: one markdown file each in content/docs/<slug>.md, rendered by
 * /docs/[slug]. Each entry feeds the page's metadata, its TechArticle JSON-LD, the nav,
 * the sitemap. llms.txt lists them by hand. Dates are the day the text was checked against the code.
 */
export type DocsPage = {
  slug: string;
  title: string;
  description: string;
  /** ISO date of first publication. */
  published: string;
  /** ISO date the text was last checked against the code. */
  checked: string;
};

export const DOCS_PAGES: DocsPage[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Sign in, give your coding agent the setup file, and see what happens next.",
    published: "2026-11-16",
    checked: "2026-11-20",
  },
  {
    slug: "check-ins",
    title: "Check-ins",
    description: "Create a check-in for a scheduled job, ping it, and read its status with curl.",
    published: "2026-11-16",
    checked: "2026-11-16",
  },
  {
    slug: "npm-package",
    title: "spooky-checkin on npm",
    description: "Check in from a Vercel cron route or any job with one small package.",
    published: "2026-11-16",
    checked: "2026-11-16",
  },
  {
    slug: "alarms",
    title: "Alarm checks",
    description: "Mark a workflow or job as an alarm about the real world, so a fix job repairs the cause and never the check.",
    published: "2026-11-16",
    checked: "2026-11-16",
  },
  {
    slug: "mcp-server",
    title: "MCP server",
    description: "Connect your coding agent to Spooky over MCP, and see which tools it gets.",
    published: "2026-11-16",
    checked: "2026-11-16",
  },
  {
    slug: "markdown-for-agents",
    title: "Markdown for agents",
    description: "See what an AI agent gets from each of your sites, and serve a plain Markdown version from Next.js or a static site.",
    published: "2026-11-18",
    checked: "2026-11-18",
  },
  {
    slug: "api",
    title: "REST API",
    description: "Keys, scopes, endpoints and the error shape for the Spooky API.",
    published: "2026-11-16",
    checked: "2026-11-16",
  },
];

export const docsPage = (slug: string) => DOCS_PAGES.find((p) => p.slug === slug) ?? null;
