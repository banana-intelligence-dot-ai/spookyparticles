/**
 * GET /setup.md: the file a coding agent fetches when its human says
 * "set up Spooky Particles for me". Plain Markdown, numbered steps, one action
 * each. The agent never holds an OAuth token: every connection is a link the
 * human clicks. The only credential is a read key the agent gets when its
 * human approves a sign-in code; it goes to the Keychain, never through chat.
 *
 * Served from the app so the URL on the landing page is always the current
 * version. Cached for an hour by the cache-control header.
 */
import { setupMarkdown } from "@/lib/setup-markdown";

export function GET() {
  const body = setupMarkdown();
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
