import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { MARKDOWN_TWINS } from "./src/lib/markdown-twins";

/** Plain security headers on every response. No CSP yet: inline JSON-LD and the analytics tag would need nonces first. */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Pages that read their Markdown from disk at request time on Vercel.
  outputFileTracingIncludes: {
    "/privacy": ["./content/legal/**"],
    "/terms": ["./content/legal/**"],
    "/vibeops": ["./content/vibeops.md"],
    "/automate-fixes": ["./content/automate-fixes.md"],
    "/releases": ["./content/releases.md"],
    "/skill.md": ["./content/skills/spooky/SKILL.md"],
    "/how/[slug]": ["./content/how/**"],
    "/docs": ["./content/docs/**"],
    "/docs/[slug]": ["./content/docs/**"],
    "/docs/md/[slug]": ["./content/docs/**"],
    "/md/[...path]": MARKDOWN_TWINS.map((t) => `./${t.file}`),
  },
  partialPrefetching: true,
  // Turbopack's on-disk cache served an old globals.css after it changed (on Vercel and locally), so
  // the live page kept old styles under an unchanged file name. Build and dev start clean instead.
  experimental: { turbopackFileSystemCacheForBuild: false, turbopackFileSystemCacheForDev: false },
  // POSTHOG_HOST is shared by the server client and the browser client.
  env: { NEXT_PUBLIC_POSTHOG_HOST: process.env.POSTHOG_HOST ?? "" },
  // Pages that moved. Query strings ride along, so sign-in callbacks that still name the old path land right.
  async redirects() {
    return [
      { source: "/app/today", destination: "/app", permanent: false },
      { source: "/app/connections", destination: "/app/settings", permanent: false },
    ];
  },
  // Each docs page also answers at /docs/<slug>.md as plain Markdown, for agents.
  async rewrites() {
    return {
      // Markdown twins (src/lib/markdown-twins.ts): the same address with Accept: text/markdown, or <path>.md.
      beforeFiles: MARKDOWN_TWINS.flatMap((t) => [
        { source: t.path, has: [{ type: "header" as const, key: "accept", value: ".*text/markdown.*" }], destination: `/md${t.path}` },
        { source: `${t.path}.md`, destination: `/md${t.path}` },
      ]),
      afterFiles: [{ source: "/docs/:slug.md", destination: "/docs/md/:slug" }],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // A page with a Markdown twin says so. (Next sets its own Vary on pages; Vercel's router picks the twin before its cache.)
      ...MARKDOWN_TWINS.map((t) => ({ source: t.path, headers: [{ key: "Link", value: `<${t.path}.md>; rel="alternate"; type="text/markdown"` }] })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withWorkflow(nextConfig);
