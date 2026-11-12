/**
 * GitHub App: the only way we read GitHub. The user installs the app on their
 * account or org and picks the repos on GitHub's own screen. The app asks for
 * repository permissions Metadata: read and Deployments: read, nothing else,
 * so it can list private repos without any write access.
 *
 * Auth chain (docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app):
 * 1. App JWT, RS256, signed with the app's private key: iat = now - 60s (clock
 *    drift), exp = now + 9 min (GitHub's max is 10), iss = app id.
 * 2. Installation token: POST /app/installations/{id}/access_tokens with the JWT.
 *    Valid one hour. Cached in memory until 5 minutes before expiry and never
 *    written to the database or logs.
 *
 * The sign-in OAuth credentials (GITHUB_CLIENT_ID / SECRET) belong to the same
 * GitHub App; Better Auth uses them. User tokens from that flow are used here only
 * to list the installations a user can see (GET /user/installations).
 */
import { createSign } from "node:crypto";
import { requireEnv } from "../env";

export const GITHUB_API = "https://api.github.com";

export function githubHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "spooky-particles",
  };
}

/** A GitHub API error that keeps the status and never carries a token. */
export class GithubApiError extends Error {
  constructor(
    public status: number,
    public call: string,
    public githubMessage?: string,
  ) {
    super(`github ${call} ${status}${githubMessage ? `: ${githubMessage.slice(0, 120)}` : ""}`);
  }
}

export type GithubInstallation = {
  id: number;
  /** Enterprise installs carry slug/name instead of login/type. */
  account: { id: number; login?: string; type?: string; slug?: string; name?: string } | null;
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at: string | null;
  app_id: number;
  app_slug?: string;
  target_type: string;
  created_at: string;
};

export type InstallationRepo = {
  id: number;
  full_name: string;
  private: boolean;
  archived: boolean;
  html_url: string;
  pushed_at: string | null;
  default_branch: string;
  /** GitHub's primary language, null for empty or data-only repos. */
  language?: string | null;
};

/** Permission object as stored on a connection: ["deployments:read", "metadata:read"]. */
export function permissionNames(permissions: Record<string, string> | null | undefined): string[] {
  return Object.entries(permissions ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .sort();
}

/** GITHUB_APP_PRIVATE_KEY is base64 of the PEM file GitHub downloads. A raw PEM also works. */
export function decodePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
  const pem = Buffer.from(trimmed, "base64").toString("utf8").trim();
  if (!pem.startsWith("-----BEGIN")) throw new Error("GITHUB_APP_PRIVATE_KEY is not a base64-encoded PEM");
  return pem;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** Signs the app JWT. `nowMs` is injectable for tests. */
export function createAppJwt(appId: string, privateKeyPem: string, nowMs = Date.now()): string {
  const now = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(privateKeyPem))}`;
}

type Fetch = typeof fetch;

export type GithubAppDeps = {
  appId: string;
  privateKeyPem: string;
  fetch?: Fetch;
  now?: () => number;
};

/** Refresh an installation token when it has less than this left. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export function createGithubApp(deps: GithubAppDeps) {
  const doFetch: Fetch = deps.fetch ?? ((...a) => fetch(...a));
  const now = deps.now ?? Date.now;
  const tokens = new Map<string, { token: string; expiresAt: number }>();

  const jwt = () => createAppJwt(deps.appId, deps.privateKeyPem, now());

  async function call<T>(path: string, init: { method?: string; token: string; label: string }): Promise<{ data: T; res: Response }> {
    const res = await doFetch(`${GITHUB_API}${path}`, { method: init.method ?? "GET", headers: githubHeaders(init.token) });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new GithubApiError(res.status, init.label, body?.message);
    }
    const data = (res.status === 204 || res.status === 202 ? null : await res.json().catch(() => null)) as T;
    return { data, res };
  }

  /**
   * An installation token, minted on demand. 404 means the installation was
   * deleted; 403 usually means it is suspended. Callers mark the connection.
   */
  async function installationToken(installationId: string | number): Promise<string> {
    const key = String(installationId);
    const cached = tokens.get(key);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now()) return cached.token;
    const { data } = await call<{ token: string; expires_at: string }>(
      `/app/installations/${encodeURIComponent(key)}/access_tokens`,
      { method: "POST", token: jwt(), label: "POST /app/installations/{id}/access_tokens" },
    );
    const expiresAt = Date.parse(data.expires_at);
    tokens.set(key, { token: data.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : now() + 60 * 60 * 1000 });
    return data.token;
  }

  function forgetInstallationToken(installationId: string | number) {
    tokens.delete(String(installationId));
  }

  async function getInstallation(installationId: string | number): Promise<GithubInstallation> {
    const { data } = await call<GithubInstallation>(`/app/installations/${encodeURIComponent(String(installationId))}`, {
      token: jwt(),
      label: "GET /app/installations/{id}",
    });
    return data;
  }

  /** One page of repos the installation can see, plus the rate limit left after the call. */
  async function listInstallationReposPage(installationId: string | number, page: number) {
    const token = await installationToken(installationId);
    const { data, res } = await call<{ total_count: number; repositories: InstallationRepo[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      { token, label: "GET /installation/repositories" },
    );
    return {
      repos: data.repositories,
      totalCount: data.total_count,
      hasNext: /rel="next"/.test(res.headers.get("link") ?? ""),
      rateRemaining: rateRemaining(res),
    };
  }

  /** Every repo the installation can see. Stops at maxPages (100 repos each). */
  async function listInstallationRepos(installationId: string | number, maxPages = 20): Promise<InstallationRepo[]> {
    const all: InstallationRepo[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const r = await listInstallationReposPage(installationId, page);
      all.push(...r.repos);
      if (!r.hasNext) break;
    }
    return all;
  }

  /** Uninstalls the app from the account. 202 deleted; 404 already gone. */
  async function deleteInstallation(installationId: string | number): Promise<{ ok: boolean; status: number }> {
    forgetInstallationToken(installationId);
    const res = await doFetch(`${GITHUB_API}/app/installations/${encodeURIComponent(String(installationId))}`, {
      method: "DELETE",
      headers: githubHeaders(jwt()),
    });
    return { ok: res.status === 202 || res.status === 204 || res.status === 404, status: res.status };
  }

  /** Installations of this app the user can access, using the user's sign-in token. */
  async function userInstallations(userToken: string): Promise<GithubInstallation[]> {
    const all: GithubInstallation[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, res } = await call<{ total_count: number; installations: GithubInstallation[] }>(
        `/user/installations?per_page=100&page=${page}`,
        { token: userToken, label: "GET /user/installations" },
      );
      all.push(...data.installations);
      if (!/rel="next"/.test(res.headers.get("link") ?? "")) break;
    }
    return all;
  }

  /** The login behind a user token (GET /user): how a person recognizes a linked GitHub account. */
  async function userLogin(userToken: string): Promise<string | null> {
    const { data } = await call<{ login?: string }>("/user", { token: userToken, label: "GET /user" });
    return data?.login ?? null;
  }

  return {
    userLogin,
    installationToken,
    forgetInstallationToken,
    getInstallation,
    listInstallationReposPage,
    listInstallationRepos,
    deleteInstallation,
    userInstallations,
  };
}

export type GithubApp = ReturnType<typeof createGithubApp>;

export function rateRemaining(res: Response): number | null {
  const v = res.headers.get("x-ratelimit-remaining");
  return v === null ? null : Number(v);
}

let app: GithubApp | undefined;

/** Lazy, so importing never reads env (builds need no secrets). */
export function githubApp(): GithubApp {
  app ??= createGithubApp({
    appId: requireEnv("GITHUB_APP_ID"),
    privateKeyPem: decodePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY")),
  });
  return app;
}

/** Where "Install on GitHub" sends the user. GitHub passes `state` back to the Setup URL. */
export function githubInstallUrl(state: string): string {
  const u = new URL(`https://github.com/apps/${encodeURIComponent(requireEnv("GITHUB_APP_SLUG"))}/installations/new`);
  u.searchParams.set("state", state);
  return u.toString();
}

export const installationToken = (id: string | number) => githubApp().installationToken(id);
export const getInstallation = (id: string | number) => githubApp().getInstallation(id);
export const listInstallationRepos = (id: string | number, maxPages?: number) => githubApp().listInstallationRepos(id, maxPages);
export const deleteInstallation = (id: string | number) => githubApp().deleteInstallation(id);
export const userInstallations = (userToken: string) => githubApp().userInstallations(userToken);
export const userLogin = (userToken: string) => githubApp().userLogin(userToken);
