import { NextResponse } from "next/server";
import { sessionUserId, signInRedirect } from "@/lib/connect";
import { vercelIntegrationConfig } from "@/lib/env";
import { OAUTH_COOKIE, createOAuthState, oauthCookieOptions } from "@/lib/oauth-state";
import { track } from "@/lib/analytics/server";

export async function GET(req: Request) {
  const config = vercelIntegrationConfig();
  if (!config) return new Response(null, { status: 404 });
  const userId = await sessionUserId(req);
  if (!userId) return signInRedirect();
  const { state, cookieValue } = createOAuthState(userId, "vercel-integration");
  const target = new URL(`https://vercel.com/integrations/${encodeURIComponent(config.slug)}/new`);
  target.searchParams.set("state", state);
  const response = NextResponse.redirect(target);
  response.cookies.set(OAUTH_COOKIE, cookieValue, oauthCookieOptions);
  await track(userId, "consent_screen_shown", { provider: "vercel" });
  return response;
}
