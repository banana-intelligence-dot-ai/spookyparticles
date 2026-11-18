"use client";
/**
 * Settings: the accounts Spooky reads, where alerts go, what is not watched, the homepage feed, product emails,
 * ways to sign in, your data, and the pages that left the rail. Read only toward your accounts.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { apiPost, formatInt, useApi } from "@/components/use-api";
import { MarketingToggle } from "../marketing-emails";
import { PublicFeedToggle } from "../public-feed-toggle";
import { MORE } from "../rail";
import { SignInWays, type Identity } from "./sign-in-ways";
import { Stopped } from "./stopped";
import { VercelConnect } from "./vercel-connect";
import { Channels, type Channel } from "./channels";
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

export function SettingsView({ integrationEnabled, vercelSignInEnabled }: { integrationEnabled: boolean; vercelSignInEnabled: boolean }) {
  const params = useSearchParams();
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => running(c.sync)) ? 3000 : null),
  });
  const router = useRouter();
  const me = useApi<{ user?: { email: string }; signInIdentities?: Identity[] }>("/api/v1/me");
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
      callbackURL: "/app/settings",
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

  return (
    <>
      <PageHeader
        title="Settings"
        lede="What Spooky reads, where alerts go, and what you stopped watching. Read only toward your accounts; nothing is ever deleted on them."
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
        <div className="mt-14">
          <Channels list={channels.data?.channels ?? []} loading={channels.loading} onChanged={() => channels.reload()} onNotice={setNotice} />
        </div>
      ) : null}
      {conns.data ? <Stopped now={now ?? 0} /> : null}
      {conns.data ? (
        <section aria-labelledby="feed-title" className="mt-14">
          <SectionTitle id="feed-title">Homepage feed</SectionTitle>
          <PublicFeedToggle />
        </section>
      ) : null}
      {conns.data ? (
        <section aria-labelledby="emails-title" className="mt-14">
          <SectionTitle id="emails-title">Emails</SectionTitle>
          <MarketingToggle />
        </section>
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
      {conns.data ? <YourData /> : null}
      {conns.data ? (
        <MorePages />
      ) : null}
      {me.data?.user ? (
        <p className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-fg-2 md:hidden">
          <span className="min-w-0 truncate">Signed in as {me.data.user.email}</span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg sm:min-h-0"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
            }}
          >
            Sign out
          </button>
        </p>
      ) : null}
    </>
  );
}

/** The pages that left the rail, each with what it is for. */
export function MorePages() {
  return (
    <section aria-labelledby="more-title" className="mt-14">
      <SectionTitle id="more-title">More pages</SectionTitle>
      <ul className="border-t border-line-1">
        {MORE.map((m) => (
          <li key={m.href} className="border-b border-line-1">
            <Link href={m.href} className="group -mx-2 flex min-h-12 items-center gap-4 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-fg/40">
              <span className="w-28 shrink-0 text-[14px] text-fg">{m.label}</span>
              <span className="min-w-0 flex-1 text-[14px] text-pretty text-fg-2">{m.what}</span>
              <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0 text-fg-3 transition-colors group-hover:text-fg" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything Spooky holds about the account, as one JSON file. The same call an agent makes: POST /api/v1/export. */
export function YourData() {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const download = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/v1/export", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "spooky-particles-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  return (
    <section aria-labelledby="data-title" className="mt-14">
      <SectionTitle
        id="data-title"
        action={
          <button type="button" className={buttonStyles.secondary} disabled={state === "busy"} onClick={() => void download()}>
            {state === "busy" ? "Preparing…" : "Download my data"}
          </button>
        }
      >
        Your data
      </SectionTitle>
      <p className="-mt-2 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
        Everything Spooky holds about this account, as one JSON file. Tokens and secret values are never in it.
      </p>
      {state === "failed" ? <p className="mt-2 text-[14px] text-red">The export didn&apos;t download. Try again.</p> : null}
    </section>
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
              className="border-y border-line-1 py-4 text-[14px] text-pretty text-fg-2"
            >
              {EMPTY_LINE[g.provider] ?? "Nothing connected yet."}
            </p>
          ) : null}
          {g.rows.length ? (
            <List plain>
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
