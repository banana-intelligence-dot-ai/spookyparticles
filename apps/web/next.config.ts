import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

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
    "/releases": ["./content/releases.md"],
    "/skill.md": ["./content/skills/spooky/SKILL.md"],
    "/how/[slug]": ["./content/how/**"],
  },
  partialPrefetching: true,
  // POSTHOG_HOST is shared by the server client and the browser client.
  env: { NEXT_PUBLIC_POSTHOG_HOST: process.env.POSTHOG_HOST ?? "" },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
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
