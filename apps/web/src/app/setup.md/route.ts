/**
 * GET /setup.md: the file a coding agent fetches when its human says
 * "set up Spooky Particles for me". Plain Markdown, numbered steps, one action
 * each. The agent never holds an OAuth token: every connection is a link the
 * human clicks. The agent gets a read key by default or can request a 90-day write key;
 * its human approves the access on screen, and the key goes to the Keychain, never through chat.
 *
 * Served from the app so the URL on the landing page is always the current
 * version. Cached for an hour by the cache-control header.
 */
import { after } from "next/server";
import { classifySetupReader } from "@/lib/analytics/setup-reader";
import { recordUsage } from "@/lib/analytics/usage";
import { setupMarkdown } from "@/lib/setup-markdown";

export function GET(request: Request) {
  const reader = classifySetupReader(request.headers.get("user-agent"));
  after(async () => {
    try {
      await recordUsage({ event: "setup_md_read", props: { reader } });
    } catch {
      // Counting must never break the setup response.
    }
  });
  const body = setupMarkdown();
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
