/**
 * GET /x-posted.json: what the @spookyparticles account has posted through the posting step, as a
 * JSON array of strings, oldest first. Public on purpose: the posts are public on X already, and
 * the Artifact News account's job reads this to avoid near-copies across the two accounts with no
 * new login. [] until the first post.
 */
import { connection } from "next/server";
import { postedTexts } from "@/lib/x-posts/run";

export async function GET() {
  await connection();
  try {
    return Response.json(await postedTexts(), { headers: { "cache-control": "no-store" } });
  } catch {
    // Fail loud, not empty: [] would read as "nothing posted" and let a near-copy through.
    return new Response("unavailable\n", { status: 503, headers: { "cache-control": "no-store" } });
  }
}
