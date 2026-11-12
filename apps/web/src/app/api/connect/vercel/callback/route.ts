import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/server";
import { appRedirect, readStateCookie, sessionUserId } from "@/lib/connect";
import { appUrl, vercelIntegrationConfig } from "@/lib/env";
import { OAUTH_COOKIE, oauthCookieOptions, verifyOAuthState } from "@/lib/oauth-state";
import { vercelGet } from "@/lib/providers/vercel";
import { exchangeVercelCode } from "@/lib/providers/vercel-oauth";
import { startSync } from "@/lib/sync";
import { installDisplayName, retireCoveredTokens, saveVercelIntegration } from "@/lib/vercel-integration";
import { createPendingInstall, PENDING_COOKIE, pendingCookieOptions, safeVercelNext, verifyPendingInstall } from "@/lib/vercel-integration-state";

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  if (!raw) return undefined;
  try { return decodeURIComponent(raw.slice(name.length + 1)); } catch { return undefined; }
}

function clear(response: NextResponse) {
  response.cookies.delete({ name: OAUTH_COOKIE, path: oauthCookieOptions.path });
  response.cookies.delete({ name: PENDING_COOKIE, path: pendingCookieOptions.path });
  return response;
}

function failure(code: string) {
  return clear(appRedirect("/app/connections", { error: code, provider: "vercel" }));
}

export async function GET(req: Request) {
  const config = vercelIntegrationConfig();
  if (!config) return new Response(null, { status: 404 });
  const userId = await sessionUserId(req);
  const current = new URL(req.url);
  const pending = verifyPendingInstall(cookie(req, PENDING_COOKIE));
  // A Vercel-side install can arrive without our state cookie. Keep its short-lived
  // code sealed server-side while the person signs in, then resume this route.
  if (!userId) {
    if (!pending && !current.searchParams.get("code")) return failure("install_failed");
    const response = NextResponse.redirect(new URL("/?signin=required&returnTo=/api/connect/vercel/callback", appUrl()));
    if (!pending) response.cookies.set(PENDING_COOKIE, createPendingInstall(current.search), pendingCookieOptions);
    return response;
  }
  const params = pending && !current.searchParams.get("code") ? new URLSearchParams(pending) : current.searchParams;
  // State is required. An install that did not start from our own button carries no
  // proof that this signed-in person asked for it, so a crafted link could attach a
  // stranger's Vercel account to theirs. Until installs can start from Vercel's side
  // behind an explicit confirm step, they must start here.
  const stateCookie = readStateCookie(req);
  if (!stateCookie || !verifyOAuthState(stateCookie, params.get("state"), userId, "vercel-integration")) {
    return failure("state_mismatch");
  }
  if (params.get("error")) {
    await track(userId, "consent_abandoned", { provider: "vercel", reason: params.get("error")!.slice(0, 64) });
    return failure(params.get("error") === "access_denied" ? "consent_declined" : "provider_error");
  }
  const code = params.get("code");
  const configurationId = params.get("configurationId");
  if (!code || !configurationId || code.length > 512 || configurationId.length > 128) return failure("install_failed");
  try {
    const token = await exchangeVercelCode({
      clientId: config.clientId, clientSecret: config.clientSecret, code,
      redirectUri: `${appUrl()}/api/connect/vercel/callback`,
    });
    const teamId = token.team_id;
    if (params.get("teamId") && params.get("teamId") !== teamId) return failure("install_failed");
    let display: string;
    let externalAccountId: string;
    let proofProjectId: string | null = null;
    if (teamId) {
      // Team installs require teamId on reads. A project list proves the token
      // can read the selected team without fetching secret-bearing project rows.
      const projects = await vercelGet<{ projects?: { id: string }[] }>(token.access_token, "/v10/projects", { teamId, limit: 1 });
      proofProjectId = projects.projects?.[0]?.id ?? null;
      externalAccountId = `team:${teamId}`;
      display = `Vercel team ${teamId}`;
    } else {
      const projects = await vercelGet<{ projects?: { id: string }[] }>(token.access_token, "/v10/projects", { limit: 1 });
      proofProjectId = projects.projects?.[0]?.id ?? null;
      externalAccountId = `user:${token.user_id}`;
      display = "Vercel personal account";
    }
    display = (await installDisplayName(token.access_token, teamId)) ?? display;
    const row = await saveVercelIntegration({
      userId, externalAccountId, display, accessToken: token.access_token, proofProjectId,
      meta: { via: "integration", installationId: token.installation_id, configurationId, teamId },
    });
    let replaced = 0;
    try {
      replaced = await retireCoveredTokens({ userId, installRowId: row.id, installTeamId: teamId, installUserId: token.user_id, proofProjectId });
    } catch (err) { console.error("[vercel install] token retirement failed", (err as Error).message); }
    await track(userId, "consent_granted", { provider: "vercel", connection_id: row.id, via: "integration" });
    try { await startSync(row, `user:${userId}`); }
    catch (err) { console.error("[vercel install] first sync failed", row.id, (err as Error).message); }
    const vercelNext = safeVercelNext(params.get("next"));
    const destination = new URL(vercelNext ?? "/app/connections?connected=vercel", appUrl());
    // Our own page shows the notice; Vercel's page gets its URL untouched.
    if (replaced && !vercelNext) destination.searchParams.set("replaced", "1");
    return clear(NextResponse.redirect(destination));
  } catch (err) {
    console.error("[vercel install] callback failed", (err as Error).message);
    return failure("exchange_failed");
  }
}
