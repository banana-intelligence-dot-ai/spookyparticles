/**
 * Who may link a GitHub App installation to their Spooky Particles account.
 *
 * Linking matters because revoke uninstalls the app from that GitHub account
 * (DELETE /app/installations/{id}), and GitHub's Setup URL can be hit with a
 * spoofed installation_id. So:
 *
 * - Personal installs: only the owner. The installation's account id must equal
 *   the GitHub user id of one of the user's linked GitHub sign-in accounts (a
 *   user can add several GitHub accounts; each is confirmed by signing in to it).
 * - Organization and enterprise installs: only the person who just installed it
 *   through our install link. The user must be able to see the installation
 *   (GET /user/installations with their own token), the sealed state cookie must
 *   verify, GitHub must report setup_action=install, and the installation must
 *   be fresh. Org members cannot install apps on an org, only request them, so
 *   a fresh install that came through this user's own flow was made by an owner
 *   or app manager. Older org installs are never adopted silently.
 */
import type { GithubInstallation } from "./providers/github-app";

/** An org install counts as made by this flow if GitHub created it this recently. */
export const FRESH_INSTALL_MS = 15 * 60 * 1000;

export type InstallationVerdict = "ok" | "not_yours" | "org_needs_install_link";

export function isPersonalInstall(inst: Pick<GithubInstallation, "account">): boolean {
  return inst.account?.type === "User";
}

export function installationVerdict(
  inst: Pick<GithubInstallation, "account" | "created_at">,
  ctx: { githubUserIds: string[]; userCanSee: boolean; viaInstallFlow: boolean; nowMs?: number },
): InstallationVerdict {
  if (isPersonalInstall(inst)) {
    return ctx.githubUserIds.includes(String(inst.account?.id)) ? "ok" : "not_yours";
  }
  if (!ctx.userCanSee) return "not_yours";
  const created = Date.parse(inst.created_at);
  const fresh = Number.isFinite(created) && (ctx.nowMs ?? Date.now()) - created <= FRESH_INSTALL_MS;
  return ctx.viaInstallFlow && fresh ? "ok" : "org_needs_install_link";
}

/** The name shown for an installation: the user or org login. */
export function installationDisplay(inst: Pick<GithubInstallation, "id" | "account">): string {
  return inst.account?.login ?? inst.account?.slug ?? inst.account?.name ?? `installation ${inst.id}`;
}
