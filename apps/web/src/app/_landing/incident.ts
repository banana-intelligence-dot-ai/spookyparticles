/**
 * The hero replays one real failure: this site's own production deploy of commit 149449c on
 * Nov 9, 2026, and the fix that went live after it. Every value below was read from the Vercel
 * API for the spooky-particles project (the failed deployment and the fix) and the repo's git log. Nothing here is invented; the only
 * edit is that the log keeps the lines the build printed, in order, minus blank ones and the two
 * long import-chain lines (shortened with an ellipsis, marked below).
 *
 * The cause is the line today's picker (logTailAndCause in lib/providers/vercel.ts) names for
 * this exact log; a test holds it there. Times are UTC.
 */
export const INCIDENT = {
  project: "spooky-particles",
  environment: "production",
  host: "Vercel",
  date: "Nov 9, 2026",
  failed: {
    commit: "149449c",
    /** Build started and failed, from the deployment's events. */
    startedAt: "22:30:47",
    failedAt: "22:30:55",
    seconds: 8,
  },
  fixed: {
    commit: "d0c7f6c",
    readyAt: "22:40:43",
  },
  /** failed.failedAt to fixed.readyAt: 1794264043457 - 1794263455777 ms. */
  minutesToFix: "9 min 48 s",
  cause: "Error [WorkflowBuildError]: Workflow bundle cannot run in the workflow sandbox.",
  /** The alert's subject line, as renderDeployFailed in lib/alerts/deploy-failed.ts writes it. */
  subject: "spooky-particles: production deploy failed on Vercel",
  /** Our own schedule, from apps/web/vercel.json. */
  schedule: { path: "/api/cron/watch", every: "every 5 minutes" },
} as const;

/** The build log as Vercel returned it, oldest first. `cause: true` marks the line the picker names. */
export const BUILD_LOG: { text: string; cause?: true; npm?: true }[] = [
  { text: "> @spooky/web@0.1.0 build" },
  { text: "> next build" },
  { text: "▲ Next.js 16.4.3 (Turbopack)" },
  { text: "⨯ Failed to load next.config.ts, see more info here https://nextjs.org/docs/messages/next-config-error" },
  { text: "> Build error occurred" },
  { text: "Error [WorkflowBuildError]: Workflow bundle cannot run in the workflow sandbox.", cause: true },
  { text: "Workflow functions are evaluated in a sandbox without `require`. The bundle below still contains" },
  { text: "`require()` calls, which throw `ReferenceError: require is not defined` when the bundle is loaded." },
  { text: "Imports left external (2):" },
  { text: '  • "node:util"' },
  { text: "    imported by ../../node_modules/posthog-node/dist/gzip.node.mjs" },
  { text: "    via src/workflows/github-inventory.ts → src/workflows/steps/github.ts → …" },
  { text: '  • "node:zlib"' },
  { text: "    imported by ../../node_modules/posthog-node/dist/gzip.node.mjs" },
  { text: "    via src/workflows/github-inventory.ts → src/workflows/steps/github.ts → …" },
  { text: "Learn more: https://workflow-sdk.dev/err/node-js-module-in-workflow" },
  { text: '╰▶ hint: Move the code that needs Node.js built-ins into a "use step" function, or import the package only from step files.' },
  { text: "npm error Lifecycle script `build` failed with error:", npm: true },
  { text: "npm error code 1", npm: true },
  { text: "npm error path /vercel/path0/apps/web", npm: true },
  { text: "npm error workspace @spooky/web@0.1.0", npm: true },
  { text: "npm error location /vercel/path0/apps/web", npm: true },
  { text: "npm error command failed", npm: true },
  { text: "npm error command sh -c next build", npm: true },
  { text: 'Error: [BUILD_UTILS_SPAWN_1] Command "npm run build" exited with 1', npm: true },
];
