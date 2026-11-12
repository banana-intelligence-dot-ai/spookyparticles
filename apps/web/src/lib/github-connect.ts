/**
 * GitHub connection = a GitHub App installation.
 *
 * start: /api/connect/github/start seals state into the cookie and sends the
 *   user to github.com/apps/{slug}/installations/new?state=...
 * setup: GitHub's Setup URL, /api/connect/github/setup?installation_id&setup_action&state.
 *   We never trust installation_id on its own (GitHub's docs warn it can be
 *   spoofed); see src/lib/github-installation-policy.ts for the rule.
 * adopt: installs made on GitHub directly (no state). On GET /api/v1/connections
 *   (throttled per user), we list installations with the sign-in token of each
 *   linked GitHub account and link the personal ones not yet connected.
 *
 * Several GitHub accounts: a user links more GitHub accounts by signing in to
 * each one (Better Auth account linking). Personal installs under any linked
 * account are theirs; org installs still come only through the install link.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Connection } from "@/db/schema";
import { track } from "./analytics/server";
import { getAuth } from "./auth";
import { appRedirect, readStateCookie, redirectWithState, safeNext, sessionUserId, signInRedirect } from "./connect";
import { saveInstallationConnection } from "./connections";
import { installationDisplay, installationVerdict, isPersonalInstall, type InstallationVerdict } from "./github-installation-policy";
import { verifyOAuthState } from "./oauth-state";
import {
  GithubApiError,
  getInstallation,
  githubInstallUrl,
  permissionNames,
  userInstallations,
  type GithubInstallation,
} from "./providers/github-app";
import { startSync } from "./sync";

export function beginGithubInstall(req: Request) {
  return redirectWithState(req, "github", ({ state }) => githubInstallUrl(state));
}

type GithubSignIn = { accountRowId: string; githubUserId: string };

/** The user's linked GitHub sign-in accounts: Better Auth's row id and the GitHub user id of each. */
async function githubSignIns(userId: string): Promise<GithubSignIn[]> {
  const rows = await getDb()
    .select({ id: schema.account.id, accountId: schema.account.accountId })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "github")));
  return rows.map((row) => ({ accountRowId: row.id, githubUserId: row.accountId }));
}

/** True when any linked GitHub account can see this installation (GET /user/installations). */
async function anySignInSees(
  userId: string,
  signIns: GithubSignIn[],
  installationId: string,
): Promise<{ seen: boolean; tokens: number }> {
  let tokens = 0;
  for (const s of signIns) {
    const token = await githubUserToken(userId, s.accountRowId);
    if (!token) continue;
    tokens += 1;
    if ((await userInstallations(token)).some((i) => String(i.id) === installationId)) return { seen: true, tokens };
  }
  return { seen: false, tokens };
}

/**
 * The user's GitHub App user token from sign-in, refreshed by Better Auth when it
 * has expired (GitHub App user tokens last 8 hours). Null when there is none.
 * Better Auth 1.7 selects the account by its row id, not by provider.
 */
async function githubUserToken(userId: string, accountRowId: string): Promise<string | null> {
  try {
    const t = await getAuth().api.getAccessToken({ body: { accountId: accountRowId, userId } });
    return t?.accessToken || null;
  } catch (err) {
    console.error("[github] user token unavailable", (err as Error).message);
    return null;
  }
}

type LinkResult =
  | { ok: true; connection: Connection }
  | { ok: false; code: "installation_linked_elsewhere" | Exclude<InstallationVerdict, "ok"> };

/** Save the installation as this user's connection and start the first inventory sync. */
async function linkInstallation(userId: string, inst: GithubInstallation): Promise<LinkResult> {
  const installationId = String(inst.id);
  const holders = await getDb()
    .select({ userId: schema.connections.userId, status: schema.connections.status })
    .from(schema.connections)
    .where(and(eq(schema.connections.provider, "github"), eq(schema.connections.externalAccountId, installationId)));
  if (holders.some((h) => h.userId !== userId && h.status !== "revoked")) {
    return { ok: false, code: "installation_linked_elsewhere" };
  }

  const suspended = Boolean(inst.suspended_at);
  const connection = await saveInstallationConnection({
    userId,
    installationId,
    display: installationDisplay(inst),
    scopes: permissionNames(inst.permissions),
    actor: `user:${userId}`,
    status: suspended ? "errored" : "active",
    statusReason: suspended ? "Installation suspended on GitHub" : null,
  });
  await track(userId, "consent_granted", { provider: "github", connection_id: connection.id });

  if (!suspended) {
    try {
      await startSync(connection, `user:${userId}`);
    } catch (err) {
      // Saved either way; a sync already running is fine, otherwise the user can start one.
      console.error("[github] first sync did not start", connection.id, (err as Error).message);
    }
  }
  return { ok: true, connection };
}

export async function finishGithubSetup(req: Request) {
  const url = new URL(req.url);
  const userId = await sessionUserId(req);
  // Signed out: the install stays on GitHub; adoption links it after sign-in if it is personal.
  if (!userId) return signInRedirect();

  const stateParam = url.searchParams.get("state");
  const verified = stateParam ? verifyOAuthState(readStateCookie(req), stateParam, userId, "github") : null;
  const next = verified?.next ? safeNext(verified.next) : "/app";
  const setupAction = url.searchParams.get("setup_action");
  const fail = (code: string) => appRedirect(next, { error: code, provider: "github" });

  // An org member asked an owner to approve the install. Nothing to link yet.
  if (setupAction === "request") return appRedirect(next, { github: "requested" });

  const installationId = url.searchParams.get("installation_id");
  if (!installationId || !/^\d+$/.test(installationId)) return fail("install_failed");

  const signIns = await githubSignIns(userId);
  // Signed in with Google only: confirm the GitHub account first, then adoption links it.
  if (!signIns.length) return appRedirect(next, { github: "confirm" });

  let inst: GithubInstallation;
  try {
    inst = await getInstallation(installationId);
  } catch (err) {
    console.error("[github] installation lookup failed", (err as Error).message);
    return fail(err instanceof GithubApiError && err.status === 404 ? "installation_not_yours" : "provider_error");
  }

  const githubUserIds = signIns.map((s) => s.githubUserId);
  if (isPersonalInstall(inst) && !githubUserIds.includes(String(inst.account?.id))) {
    // Installed under a GitHub account not linked here. The user adds that account
    // (sign in to it); adoption then links the install on its own.
    return appRedirect(next, { github: "confirm" });
  }

  let userCanSee = false;
  if (!isPersonalInstall(inst)) {
    try {
      const r = await anySignInSees(userId, signIns, installationId);
      if (!r.tokens) return appRedirect(next, { github: "confirm" });
      userCanSee = r.seen;
    } catch (err) {
      console.error("[github] user installations failed", (err as Error).message);
      if (err instanceof GithubApiError && err.status === 401) return appRedirect(next, { github: "confirm" });
      return fail("provider_error");
    }
  }

  const verdict = installationVerdict(inst, {
    githubUserIds,
    userCanSee,
    viaInstallFlow: Boolean(verified) && setupAction === "install",
  });
  if (verdict !== "ok") return fail(verdict === "not_yours" ? "installation_not_yours" : verdict);

  const linked = await linkInstallation(userId, inst);
  if (!linked.ok) return fail(linked.code);
  return appRedirect(next, { connected: "github" });
}

/** Adoption runs at most this often per user per server instance. */
const ADOPT_INTERVAL_MS = 30_000;
const lastAdopt = new Map<string, number>();

/**
 * Link personal installations the user made on GitHub directly, under any of
 * their linked GitHub accounts. Idempotent: an installation already linked to
 * anyone is skipped. Org installs are never adopted silently (see the policy
 * module). Returns how many were linked.
 */
export async function adoptGithubInstallations(userId: string): Promise<number> {
  const last = lastAdopt.get(userId);
  if (last && Date.now() - last < ADOPT_INTERVAL_MS) return 0;
  lastAdopt.set(userId, Date.now());

  const signIns = await githubSignIns(userId);
  if (!signIns.length) return 0;
  const githubUserIds = signIns.map((s) => s.githubUserId);

  const mine = new Map<string, GithubInstallation>();
  for (const s of signIns) {
    const token = await githubUserToken(userId, s.accountRowId);
    if (!token) continue;
    let installs: GithubInstallation[];
    try {
      installs = await userInstallations(token);
    } catch (err) {
      console.error("[github] adopt: user installations failed", (err as Error).message);
      continue;
    }
    for (const i of installs) {
      if (installationVerdict(i, { githubUserIds, userCanSee: true, viaInstallFlow: false }) === "ok") {
        mine.set(String(i.id), i);
      }
    }
  }
  if (!mine.size) return 0;

  const known = await getDb()
    .select({ externalAccountId: schema.connections.externalAccountId })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.provider, "github"),
        inArray(schema.connections.externalAccountId, [...mine.keys()]),
      ),
    );
  const skip = new Set(known.map((k) => k.externalAccountId));

  let linked = 0;
  for (const [id, inst] of mine) {
    if (skip.has(id)) continue;
    const r = await linkInstallation(userId, inst);
    if (r.ok) linked += 1;
  }
  return linked;
}

/** Adoption that never throws: a GitHub hiccup must not break the connections list. */
export async function adoptQuietly(userId: string): Promise<number> {
  try {
    return await adoptGithubInstallations(userId);
  } catch (err) {
    console.error("[github] adopt failed", (err as Error).message);
    return 0;
  }
}
