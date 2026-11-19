/**
 * Plain Markdown twins of answer pages, for AI agents (CMO site test, started 2026-11-18).
 * A listed page also answers in Markdown at the same address when the request's Accept header
 * names text/markdown, and at <path>.md. The twin is the same Markdown file the page renders,
 * byte for byte: no extra words for machines, and no user-agent checks.
 *
 * The test compares these pages with matched control pages left HTML-only:
 * /vercel-deployment-failed-github, /vercel-root-directory-does-not-exist, /vibeops,
 * /how/email-into-an-ops-record. Do not add a control page here until the test ends (about 2026-12-02).
 */
export const MARKDOWN_TWINS: readonly { path: string; file: string }[] = [
  { path: "/vercel-deployment-failed", file: "content/vercel-deployment-failed.md" },
  { path: "/vercel-env-var-not-found-build", file: "content/vercel-env-var-not-found-build.md" },
  { path: "/automate-fixes", file: "content/automate-fixes.md" },
  { path: "/how/apps-across-hosts-and-logins", file: "content/how/apps-across-hosts-and-logins.md" },
];

export const MARKDOWN_CONTROLS = ["/vercel-deployment-failed-github", "/vercel-root-directory-does-not-exist", "/vibeops", "/how/email-into-an-ops-record"] as const;

export function markdownTwin(pathname: string): { path: string; file: string } | null {
  return MARKDOWN_TWINS.find((t) => t.path === pathname) ?? null;
}
