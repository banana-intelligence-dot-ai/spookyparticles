"use client";
/**
 * Connected agents: the coding agents that read Spooky Particles through the API with a
 * key the human made here. Read only by default; write is a choice the human makes on the
 * form, and it still cannot delete or see a secret. A key is shown once, then only its prefix.
 * Revoking keeps the row, dimmed, so the history stays.
 */
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { authClient } from "@/lib/auth-client";
import { Chips, SectionTitle, buttonStyles, surface } from "@/components/ui";
import { absoluteTime, relativeTime } from "../data-model";

export type AgentKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt?: string | null;
};

export type NewKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  key: string;
  expiresAt?: string | null;
};
export type KeyAccess = "read" | "write";

const ACCESS: { key: KeyAccess; label: string }[] = [
  { key: "read", label: "Read only" },
  { key: "write", label: "Read and write" },
];

export const SETUP_PROMPT =
  "Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.";

const SCOPE_WORD: Record<string, string> = {
  read: "read only",
  write: "write",
  approve: "approve",
};

export function ConnectedAgents({
  keys,
  now,
  primary,
  onCreate,
  onRevoke,
}: {
  keys: AgentKey[] | null;
  now: number;
  /** True when this is the page's one primary action (the accent). */
  primary: boolean;
  /** Creates a key. Resolves to the new key, or an error message. */
  onCreate: (name: string, access: KeyAccess, expiresOn: string | null) => Promise<NewKey | string>;
  onRevoke: (id: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Claude Code");
  const [access, setAccess] = useState<KeyAccess>("read");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<NewKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<Record<string, string>>({});

  const live = (keys ?? []).filter((k) => !k.revokedAt && (!k.expiresAt || Date.parse(k.expiresAt) > now));
  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await onCreate(name.trim() || "Claude Code", access, expiresOn || null);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else setMade(r);
  };
  const revoke = async (id: string) => {
    setRevoking(id);
    const err = await onRevoke(id);
    setRevoking(null);
    setConfirming(null);
    if (err) setRevokeError((m) => ({ ...m, [id]: err }));
  };

  return (
    <section id="agents" aria-labelledby="agents-title" className="mt-14 scroll-mt-8">
      <SectionTitle
        id="agents-title"
        count={keys ? String(live.length) : undefined}
        action={
          !open ? (
            <button
              type="button"
              className={
                primary ? buttonStyles.primary : buttonStyles.secondary
              }
              onClick={() => setOpen(true)}
            >
              Connect an agent
            </button>
          ) : null
        }
      >
        Connected agents
      </SectionTitle>
      <p className="-mt-2 mb-5 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
        Coding agents that read your projects and costs through the API, with a
        key you make here. Read only unless you choose otherwise. Revoke one and
        its key stops working at once.
      </p>

      {open ? (
        <div className={`mb-6 px-4 py-5 sm:px-6 ${surface}`}>
          <h3 className="text-[16px] font-medium text-fg">Connect an agent</h3>
          <ol className="mt-4 flex flex-col gap-6">
            <li>
              <p className="text-[14px] text-fg">
                1. Paste this into your agent.
              </p>
              <div className="mt-2 flex items-start gap-1 rounded-lg border border-line-2 bg-bg-deep/60 py-2.5 pr-1.5 pl-3">
                <code className="min-w-0 flex-1 font-mono text-[14px] leading-[1.5] break-words text-code">
                  {SETUP_PROMPT}
                </code>
                <CopyButton
                  value={SETUP_PROMPT}
                  label="Copy the setup prompt"
                />
              </div>
              <p className="mt-2 text-[14px] text-fg-2">
                It reads the steps and posts each link for you to click. It
                never sees your passwords or sign-in tokens; the only thing it
                gets is the key you make next.
              </p>
            </li>
            <li>
              <p className="text-[14px] text-fg">
                2. When it asks for a key, make one here.
              </p>
              {made ? (
                <div className="mt-3">
                  <p className="text-[14px] text-fg-2">
                    Key for <span className="text-fg">{made.name}</span>,{" "}
                    {made.scopes.map((s) => SCOPE_WORD[s] ?? s).join(", ")}:
                  </p>
                  <div className="mt-2 flex items-center gap-1 rounded-lg border border-line-3 bg-bg-deep/60 py-2 pr-1.5 pl-3">
                    <code className="min-w-0 flex-1 truncate font-mono text-[14px] text-fg">
                      {made.key}
                    </code>
                    <CopyButton value={made.key} label="Copy the key" />
                  </div>
                  <p className="mt-2 text-[14px] text-amber">
                    Shown once. Put it in your agent&apos;s environment, not in
                    a chat.
                  </p>
                  <button
                    type="button"
                    className={`${buttonStyles.secondary} mt-4`}
                    onClick={() => {
                      setMade(null);
                      setOpen(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form
                  className="mt-3 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void create();
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="text-[12px] text-fg-2">Agent name</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                        className="h-11 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9"
                      />
                    </label>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] text-fg-2">Access</span>
                      <Chips
                        label="Access"
                        value={access}
                        options={ACCESS}
                        onChange={setAccess}
                        wrap
                      />
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12px] text-fg-2">Expires (optional)</span>
                      <input
                        type="date"
                        min={new Date(now + 86_400_000).toISOString().slice(0, 10)}
                        value={expiresOn}
                        onChange={(e) => setExpiresOn(e.target.value)}
                        className="h-11 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className={`${buttonStyles.primary} sm:h-9!`}
                        disabled={busy}
                      >
                        {busy ? "Making…" : "Make key"}
                      </button>
                      <button
                        type="button"
                        className={`${buttonStyles.ghost} sm:h-9!`}
                        onClick={() => setOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <p className="max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
                    {access === "write"
                      ? "Write lets it add check-in jobs and alert channels, start a sync, and mark a finding. It still cannot delete anything or see a secret, and every change lands in your audit log."
                      : "Read only sees your map, deploys, costs and jobs. Pick read and write for an agent that should register its own scheduled jobs."}
                  </p>
                </form>
              )}
              {error ? (
                <p className="mt-2 text-[14px] text-red">{error}</p>
              ) : null}
            </li>
          </ol>
        </div>
      ) : null}

      {keys && keys.length ? (
        <ul className={`overflow-hidden ${surface}`}>
          {keys.map((k) => {
            const revoked = Boolean(k.revokedAt);
            const expired = Boolean(k.expiresAt && Date.parse(k.expiresAt) <= now);
            return (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-1 px-4 py-3.5 last:border-b-0 sm:px-6"
              >
                <div
                  className={`min-w-0 flex-1 basis-full sm:basis-0 ${revoked ? "opacity-60" : ""}`}
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="min-w-0 text-[14px] break-words text-fg">
                      {k.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[14px] text-fg-2">
                      {revoked ? (
                        <span title={absoluteTime(k.revokedAt!)}>
                          Revoked {relativeTime(k.revokedAt!, now)}
                        </span>
                      ) : expired ? (
                        <span title={absoluteTime(k.expiresAt!)}>Expired</span>
                      ) : k.lastUsedAt ? (
                        <span title={absoluteTime(k.lastUsedAt)}>
                          Used {relativeTime(k.lastUsedAt, now)}
                        </span>
                      ) : (
                        "Never used"
                      )}
                    </span>
                  </div>
                  <p className="text-[14px] text-fg-2">
                    <span title={absoluteTime(k.createdAt)}>
                      Made {relativeTime(k.createdAt, now)}
                    </span>
                    {" · key "}
                    <span className="font-mono">{k.prefix}…</span>
                    {k.scopes.some((x) => x !== "read")
                      ? ` · ${k.scopes.map((x) => SCOPE_WORD[x] ?? x).join(", ")}`
                      : ""}
                    {k.expiresAt ? ` · expires ${new Date(k.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
                  </p>
                  {revokeError[k.id] ? (
                    <p className="mt-1 text-[12px] text-red">
                      {revokeError[k.id]}
                    </p>
                  ) : null}
                </div>
                {revoked ? (
                  <span aria-hidden className="hidden sm:block sm:min-w-44" />
                ) : (
                  <div className="-ml-4 flex w-full flex-wrap items-center gap-2 sm:ml-0 sm:w-auto sm:min-w-44 sm:justify-end">
                    {confirming === k.id ? (
                      <>
                        <button
                          type="button"
                          className={buttonStyles.ghost}
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          className={`${buttonStyles.danger} text-red`}
                          disabled={revoking === k.id}
                          onClick={() => void revoke(k.id)}
                        >
                          {revoking === k.id ? "Revoking…" : "Revoke key"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={buttonStyles.quietDanger}
                        onClick={() => setConfirming(k.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : keys && !open ? (
        <p className="text-[14px] text-fg-3">No agents yet.</p>
      ) : null}
    </section>
  );
}

export type Identity = {
  provider: string;
  accountId: string;
  label?: string | null;
  since: string;
};

/** Ways to sign in: every provider identity that opens this same account. */
export function SignInWays({
  identities,
  now,
  vercelEnabled = false,
}: {
  identities: Identity[];
  now: number;
  vercelEnabled?: boolean;
}) {
  const [linkingVercel, setLinkingVercel] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const needsVercel = vercelEnabled && !identities.some((identity) => identity.provider === "vercel");

  const addVercel = async () => {
    setLinkingVercel(true);
    setLinkError(false);
    const result = await authClient.linkSocial({ provider: "vercel", callbackURL: "/app/connections" });
    if (result.error) setLinkError(true);
    setLinkingVercel(false);
  };

  return (
    <section aria-labelledby="signin-title" className="mt-14">
      <SectionTitle id="signin-title" count={String(identities.length)}>
        Ways to sign in
      </SectionTitle>
      <p className="-mt-2 mb-5 max-w-[62ch] text-[14px] leading-[1.5] text-pretty text-fg-2">
        Any of these signs you in to this same account. Connecting an inbox adds
        its Google account here on its own.
      </p>
      {needsVercel ? (
        <div className="mb-5">
          <p className="mb-3 text-[14px] text-fg-2">Vercel is becoming the only way to sign in. Add it now so you keep access.</p>
          <button type="button" className={buttonStyles.secondary} disabled={linkingVercel} onClick={addVercel}>
            {linkingVercel ? "Redirecting…" : "Add Vercel"}
          </button>
          {linkError ? <p className="mt-3 text-[14px] text-red">Vercel linking didn&apos;t start. Try again.</p> : null}
        </div>
      ) : null}
      <ul className={`overflow-hidden ${surface}`}>
        {identities.map((i) => (
          <li
            key={`${i.provider}-${i.accountId}`}
            className="flex items-center gap-x-3 border-b border-line-1 px-4 py-3.5 last:border-b-0 sm:px-6"
          >
            <span aria-hidden className="text-fg">
              {i.provider === "github" ? (
                <GitHubMark />
              ) : i.provider === "google" ? (
                <GoogleMark />
              ) : i.provider === "vercel" ? (
                <svg viewBox="0 0 16 16" className="size-4" fill="currentColor"><path d="M8 1 16 15H0L8 1Z" /></svg>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-fg">
              {i.label ? (
                <>
                  <span className="font-mono text-[13px]">{i.label}</span>
                  <span className="ml-2 text-[12px] text-fg-3">
                    {i.provider === "google"
                      ? "Google"
                      : i.provider === "github"
                        ? "GitHub"
                        : i.provider === "vercel"
                          ? "Vercel"
                        : i.provider}
                  </span>
                </>
              ) : (
                <>
                  {i.provider === "google"
                    ? "Google account"
                    : i.provider === "github"
                      ? "GitHub account"
                      : i.provider === "vercel"
                        ? "Vercel account"
                      : i.provider}
                  <span
                    className="ml-2 font-mono text-[12px] text-fg-3"
                    title="The end of the provider's account id"
                  >
                    ···{i.accountId.slice(-4)}
                  </span>
                </>
              )}
            </span>
            <span
              className="shrink-0 text-[14px] text-fg-2"
              title={absoluteTime(i.since)}
            >
              Added {relativeTime(i.since, now)}
            </span>
            <CopyButton
              value={i.accountId}
              label={`Copy ${i.provider} account id`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Google's "G" in its own colors, as its branding guidelines require. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
