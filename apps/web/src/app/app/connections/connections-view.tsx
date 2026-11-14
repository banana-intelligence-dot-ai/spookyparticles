"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  Empty,
  ErrorLine,
  List,
  Meter,
  PageHeader,
  SectionTitle,
  buttonStyles,
  surface,
} from "@/components/ui";
import { ConnectionState } from "../connection-state";
import { apiPost, apiSend, formatInt, useApi } from "@/components/use-api";
import {
  ConnectedAgents,
  SignInWays,
  type AgentKey,
  type Identity,
  type KeyAccess,
  type NewKey,
} from "./agents";
import { VercelConnect } from "./vercel-connect";
import { Channels, type Channel } from "../jobs/jobs-view";
import { authClient } from "@/lib/auth-client";
import {
  PROVIDER,
  connectError,
  fixFor,
  isRunning as running,
  progressLine,
  runningPercent,
  type Connection,
} from "../connection-model";

const GITHUB_NOTICE: Record<string, string> = {
  requested:
    "Install requested. An owner of that organization approves it on GitHub.",
  confirm:
    "Add the GitHub account that made the install. Signing in to it proves the install is yours; it then links on its own.",
};

export function ConnectionsView({ integrationEnabled, vercelSignInEnabled }: { integrationEnabled: boolean; vercelSignInEnabled: boolean }) {
  const params = useSearchParams();
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => running(c.sync)) ? 3000 : null),
  });
  const keys = useApi<{ apiKeys: AgentKey[] }>("/api/v1/api-keys");
  const me = useApi<{ signInIdentities?: Identity[] }>("/api/v1/me");
  const channels = useApi<{ channels: Channel[] }>("/api/v1/alert-channels");
  const [otherAccountDismissed, setOtherAccountDismissed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  // Setup on Today links here with ?vercel=open so the form is already open.
  const [vercelOpen, setVercelOpen] = useState(() => params.get("vercel") === "open");
  // The clock is read in an effect, once per refresh: never Date.now() during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [conns.data]);

  const error = params.get("error");
  const connected = params.get("connected");
  const githubNotice = params.get("github");

  /** A second (or third) GitHub login. Sign-in scopes only; installs under it link on their own. */
  const addGithubAccount = async () => {
    setLinking(true);
    await authClient.linkSocial({
      provider: "github",
      callbackURL: "/app/connections",
    });
    setLinking(false);
  };

  const revoke = async (id: string) => {
    setBusy(id);
    const r = await apiPost<{ revoked: { providerRevoked?: boolean } }>(
      `/api/v1/connections/${id}/revoke`,
    );
    setBusy(null);
    setConfirming(null);
    if (!r.ok) setNotice(r.error ?? "Revoke failed");
    else if (r.data?.revoked.providerRevoked === false) {
      setNotice(
        "Revoked here. The provider did not confirm; remove access in its settings too.",
      );
    }
    await conns.reload();
  };

  const sync = async (id: string) => {
    setBusy(id);
    const r = await apiPost(`/api/v1/connections/${id}/sync`);
    setBusy(null);
    if (!r.ok) setNotice(r.error ?? "Sync did not start");
    await conns.reload();
  };

  const list = conns.data?.connections ?? [];
  const hasInbox = list.some(
    (c) => c.provider === "gmail" && c.status !== "revoked",
  );
  const hasGithub = list.some(
    (c) => c.provider === "github" && c.status !== "revoked",
  );
  const hasVercel = list.some(
    (c) => c.provider === "vercel" && c.status !== "revoked",
  );
  const otherAccount =
    connected === "gmail" &&
    params.get("identity") === "other_account" &&
    !otherAccountDismissed;

  const createKey = async (
    name: string,
    access: KeyAccess,
    expiresOn: string | null,
  ): Promise<NewKey | string> => {
    const r = await apiPost<{ apiKey?: NewKey } & Partial<NewKey>>(
      "/api/v1/api-keys",
      { name, scopes: access === "write" ? ["read", "write"] : ["read"], expiresOn },
    );
    if (!r.ok || !r.data) return r.error ?? "That key wasn't made. Try again.";
    const k = (r.data.apiKey ?? r.data) as NewKey;
    await keys.reload();
    return k;
  };
  const revokeKey = async (id: string): Promise<string | null> => {
    const r = await apiSend(
      "DELETE",
      `/api/v1/api-keys/${encodeURIComponent(id)}`,
    );
    await keys.reload();
    return r.ok ? null : (r.error ?? "That didn't revoke. Try again.");
  };

  return (
    <>
      <PageHeader
        title="Accounts"
        lede="What Spooky reads, who it tells, and where alerts go. Read only. Revoke any of it here; nothing is ever deleted on your accounts."
      />

      {error ? (
        <p className="mb-4 text-[14px] text-amber">{connectError(error)}</p>
      ) : null}
      {githubNotice && GITHUB_NOTICE[githubNotice] ? (
        <p className="mb-4 text-[14px] text-fg-2">
          {GITHUB_NOTICE[githubNotice]}
        </p>
      ) : null}
      {otherAccount ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 text-[14px] text-amber"
        >
          <p className="max-w-[66ch] text-pretty">
            That Google account already signs in to a different Spooky Particles
            account. The inbox is connected here; merging accounts is coming.
          </p>
          <button
            type="button"
            className="-mt-1 inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-fg-2 hover:text-fg"
            onClick={() => setOtherAccountDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {connected && !error && !otherAccount ? (
        <p className="mb-4 text-[14px] text-fg-2">
          {connected === "vercel" && params.get("replaced") === "1"
            ? "Connected through Vercel. Your pasted token was retired, since the integration reads the same projects."
            : `${connected === "gmail" ? "Gmail" : connected === "vercel" ? "Vercel" : "GitHub"} connected. Read-only.`}
        </p>
      ) : null}
      {notice ? <p className="mb-4 text-[14px] text-amber">{notice}</p> : null}
      {conns.error ? <ErrorLine message={conns.error} /> : null}
      {conns.loading ? <p className="text-[16px] text-fg-2">Loading…</p> : null}

      {conns.data ? (
        <ConnectionsList
          list={list}
          providers={MAIN}
          now={now ?? 0}
          busy={busy}
          confirming={confirming}
          onConfirm={setConfirming}
          onRevoke={revoke}
          onSync={sync}
          actions={{
            github: (
              <>
                <button
                  type="button"
                  className={buttonStyles.ghost}
                  disabled={linking}
                  onClick={addGithubAccount}
                >
                  {linking ? "Redirecting…" : "Add GitHub account"}
                </button>
                <a
                  href="/api/connect/github/start"
                  className={
                    hasGithub ? buttonStyles.secondary : buttonStyles.primary
                  }
                >
                  Install on GitHub
                </a>
              </>
            ),
            vercel: (
              integrationEnabled ? <><a href="/api/connect/vercel/start" className={hasVercel ? buttonStyles.secondary : buttonStyles.primary}>Install on Vercel</a><button type="button" className={buttonStyles.secondary} aria-expanded={vercelOpen || !hasVercel} onClick={() => { setVercelOpen(true); requestAnimationFrame(() => document.getElementById("vercel-token")?.focus()); }}>Add a read token</button></> : <button
                type="button"
                className={
                  hasGithub && !hasVercel
                    ? buttonStyles.primary
                    : buttonStyles.secondary
                }
                aria-expanded={vercelOpen}
                onClick={() => setVercelOpen((v) => !v)}
              >
                {hasVercel ? "Add another token" : "Add Vercel token"}
              </button>
            ),
          }}
          panels={{
            // Once Vercel is connected, the setup guide waits behind its button instead of sitting open above the accounts.
            vercel: (vercelOpen || (integrationEnabled && !hasVercel)) ? (
              <VercelConnect
                integrationEnabled={integrationEnabled}
                onConnected={() => conns.reload()}
                onClose={() => setVercelOpen(false)}
              />
            ) : null,
          }}
        />
      ) : null}

      {conns.data ? (
        <ConnectedAgents
          keys={keys.status === 404 ? [] : (keys.data?.apiKeys ?? null)}
          now={now ?? 0}
          primary={hasGithub && hasVercel}
          onCreate={createKey}
          onRevoke={revokeKey}
        />
      ) : null}
      {conns.data ? (
        <div className="mt-14">
          <Channels list={channels.data?.channels ?? []} loading={channels.loading} onChanged={() => channels.reload()} onNotice={setNotice} />
        </div>
      ) : null}
      {me.data?.signInIdentities && (vercelSignInEnabled || me.data.signInIdentities.length > 0) ? (
        <SignInWays identities={me.data.signInIdentities.filter((identity) => identity.provider !== "vercel" || vercelSignInEnabled)} now={now ?? 0} vercelEnabled={vercelSignInEnabled} />
      ) : null}
      {conns.data ? (
        <div className="mt-14">
          <ConnectionsList
            list={list}
            providers={["gmail"]}
            summary={false}
            now={now ?? 0}
            busy={busy}
            confirming={confirming}
            onConfirm={setConfirming}
            onRevoke={revoke}
            onSync={sync}
            actions={{
              gmail: (
                <a href="/api/connect/gmail/start" className={buttonStyles.secondary}>
                  {hasInbox ? "Add another inbox" : "Add Gmail inbox"}
                </a>
              ),
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function ConnectionsEmpty() {
  return (
    <Empty title="Nothing connected.">
      <p>
        Install on GitHub once for each account or organization you deploy from,
        add every inbox that gets bills, and paste a Vercel token if you deploy
        there. Access is read-only, and you can revoke it here.
      </p>
    </Empty>
  );
}

const ORDER: Connection["provider"][] = [
  "github",
  "vercel",
  "supabase",
  "cloudflare",
  "gmail",
];
/** The accounts Spooky watches projects through. Gmail is an optional extra, listed last on its own. */
export const MAIN: Connection["provider"][] = ["github", "vercel", "supabase", "cloudflare"];
/** Providers that get a section even before anything is connected: the way in lives beside the rows. */
const ALWAYS: Connection["provider"][] = ["github", "gmail", "vercel"];

/** One line of what each empty section will hold once connected. */
const EMPTY_LINE: Partial<Record<Connection["provider"], string>> = {
  github:
    "Every repo and deployment from the accounts you install it on. Metadata and deployments, read.",
  gmail:
    "Optional. Notices from your hosts that land in this inbox. One scope, gmail.readonly.",
  vercel:
    "Every project on the account or team, including ones that never touched GitHub. Read-only in code: GET plus one schedule-history query.",
};

/** The connection rows, grouped by provider, each section with its own way in. Presentational: the view owns data and actions. */
export function ConnectionsList({
  list,
  providers = ORDER,
  summary = true,
  now,
  busy,
  confirming,
  onConfirm,
  onRevoke,
  onSync,
  actions = {},
  panels = {},
}: {
  list: Connection[];
  /** Which provider sections to draw, in this order. Default: all of them. */
  providers?: Connection["provider"][];
  /** The "needs you" line on top. Off for a second list on the same page. */
  summary?: boolean;
  now: number;
  busy: string | null;
  confirming: string | null;
  onConfirm: (id: string | null) => void;
  onRevoke: (id: string) => void;
  onSync: (id: string) => void;
  /** The connect buttons per provider, rendered beside the section title. */
  actions?: Partial<Record<Connection["provider"], ReactNode>>;
  /** A panel a section opens under its title (the Vercel token steps). */
  panels?: Partial<Record<Connection["provider"], ReactNode>>;
}) {
  const groups = ORDER.filter((p) => providers.includes(p)).map((p) => ({
    provider: p,
    rows: list.filter((c) => c.provider === p),
  })).filter((g) => g.rows.length || ALWAYS.includes(g.provider));
  const hurt = summary ? list.filter((c) => c.status === "errored") : [];
  return (
    <div className="flex flex-col gap-10">
      {hurt.length ? (
        <p className="-mt-4 flex items-baseline gap-2.5 text-[14px] text-pretty text-fg">
          <span
            aria-hidden
            className="size-[7px] shrink-0 -translate-y-px self-center rounded-full bg-amber"
          />
          <span>
            {hurt.length === 1 ? "1 needs you: " : `${hurt.length} need you: `}
            {hurt.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <span className="font-mono">{c.display}</span>
                <span className="text-fg-2">
                  {" "}
                  (
                  {(c.statusReason ?? "needs attention")
                    .replace(/\.$/, "")
                    .replace(/\. .*$/, "")
                    .replace(/^./, (ch) => ch.toLowerCase())}
                  )
                </span>
                <FixLink c={c} />
              </span>
            ))}
          </span>
        </p>
      ) : null}
      {groups.map((g) => (
        <section key={g.provider} id={g.provider} aria-labelledby={`conn-${g.provider}`}>
          <SectionTitle
            id={`conn-${g.provider}`}
            count={
              g.rows.length
                ? formatInt(g.rows.filter((c) => c.status !== "revoked").length)
                : undefined
            }
            action={
              actions[g.provider] ? (
                <div className="flex flex-wrap items-center gap-2">
                  {actions[g.provider]}
                </div>
              ) : undefined
            }
          >
            {PROVIDER[g.provider]}
          </SectionTitle>
          {panels[g.provider]}
          {g.rows.length === 0 ? (
            <p
              className={`px-4 py-4 text-[14px] text-pretty text-fg-2 sm:px-6 ${surface}`}
            >
              {EMPTY_LINE[g.provider] ?? "Nothing connected yet."}
            </p>
          ) : null}
          {g.rows.length ? (
            <List>
              {g.rows.map((c) => (
                <ConnectionRow
                  key={c.id}
                  c={c}
                  now={now}
                  busy={busy === c.id}
                  confirming={confirming === c.id}
                  onConfirm={onConfirm}
                  onRevoke={onRevoke}
                  onSync={onSync}
                />
              ))}
            </List>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function ConnectionRow({
  c,
  now,
  busy,
  confirming,
  onConfirm,
  onRevoke,
  onSync,
}: {
  c: Connection;
  now: number;
  busy: boolean;
  confirming: boolean;
  onConfirm: (id: string | null) => void;
  onRevoke: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const line = progressLine(c);
  const percent = runningPercent(c);
  const warn = c.status === "errored" || Boolean(c.sync?.error);
  const fix = fixFor(c);
  const revoked = c.status === "revoked";

  return (
    <li className="border-b border-line-1 px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start sm:gap-x-6 sm:px-6">
      {/* Column 1: identity, detail line, meter. The first line is one fixed band so the
          status and the buttons in the other columns sit on the same line. */}
      <div className={`min-w-0 ${revoked ? "opacity-60" : ""}`}>
        <div className="flex h-8 min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[14px] text-fg">
            {c.display}
          </span>
          <CopyButton value={c.display} />
          <span className="ml-auto pl-3 sm:hidden">
            <ConnectionState c={c} now={now} />
          </span>
        </div>
        {line ? (
          <p
            className={`num text-[14px] text-pretty ${warn ? "text-amber" : "text-fg-2"}`}
          >
            {line}
          </p>
        ) : null}
        {percent !== null ? (
          <div className="mt-2 max-w-sm">
            <Meter percent={percent} label={`${c.display} sync progress`} />
          </div>
        ) : null}
      </div>
      {/* Column 2: the status word, right-aligned so "Syncing" and "Synced 7 minutes ago" share an edge. */}
      <div
        className={`hidden h-8 items-center justify-end sm:flex ${revoked ? "opacity-60" : ""}`}
      >
        <ConnectionState c={c} now={now} />
      </div>
      {/* Column 3: actions. A fixed slot per button keeps Revoke in one place on every row. */}
      {revoked ? (
        <span aria-hidden className="hidden sm:block sm:w-44" />
      ) : (
        <div className="mt-2 flex min-h-11 flex-wrap items-center justify-end gap-2 sm:mt-0 sm:h-8 sm:min-h-0 sm:w-44 sm:flex-nowrap">
          {fix ? (
            <a href={fix.href} {...(fix.external ? { target: "_blank", rel: "noreferrer" } : {})} className={buttonStyles.secondary}>
              {fix.label}
            </a>
          ) : null}
          {c.status === "active" && !confirming ? (
            <button
              type="button"
              className={buttonStyles.ghost}
              disabled={busy || running(c.sync)}
              aria-label={
                running(c.sync) ? `${c.display} is syncing` : undefined
              }
              onClick={() => onSync(c.id)}
            >
              {busy ? "Starting…" : "Sync now"}
            </button>
          ) : null}
          {confirming ? (
            <>
              <button
                type="button"
                className={buttonStyles.ghost}
                onClick={() => onConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${buttonStyles.danger} text-red`}
                disabled={busy}
                onClick={() => onRevoke(c.id)}
              >
                {c.provider === "github"
                  ? "Uninstall from GitHub"
                  : "Confirm revoke"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={buttonStyles.quietDanger}
              onClick={() => onConfirm(c.id)}
            >
              Revoke
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** " Reconnect": the fix for a broken connection, inline after its reason. Nothing when none. */
function FixLink({ c }: { c: Connection }) {
  const fix = fixFor(c);
  if (!fix) return null;
  return (
    <>
      {" "}
      <a href={fix.href} {...(fix.external ? { target: "_blank", rel: "noreferrer" } : {})} className="underline decoration-line-3 underline-offset-4 hover:decoration-fg">
        {fix.label}
      </a>
    </>
  );
}
