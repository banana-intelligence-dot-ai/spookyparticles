"use client";
/**
 * Connecting an agent: the setup prompt to paste, then a key the human makes here. Read only by
 * default; write is a choice on the form, and it still cannot delete or see a secret. A key is
 * shown once, then only its prefix. Revoking keeps the row, so the history stays.
 */
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Chips, buttonStyles, surface } from "@/components/ui";

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
export const scopeWords = (scopes: string[]) => (scopes.includes("write") ? ["read and write", ...scopes.filter((s) => s !== "read" && s !== "write").map((s) => SCOPE_WORD[s] ?? s)] : scopes.map((s) => SCOPE_WORD[s] ?? s)).join(", ");

/** The two steps: paste the prompt, make the key. Closes itself with Done or Cancel. */
export function ConnectAgent({
  now,
  onCreate,
  onClose,
}: {
  now: number;
  /** Creates a key. Resolves to the new key, or an error message. */
  onCreate: (name: string, access: KeyAccess, expiresOn: string | null) => Promise<NewKey | string>;
  onClose: () => void;
}) {
  const [name, setName] = useState("Claude Code");
  const [access, setAccess] = useState<KeyAccess>("read");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<NewKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await onCreate(name.trim() || "Claude Code", access, expiresOn || null);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else setMade(r);
  };

  return (
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
                  onClose();
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
                    onClick={() => onClose()}
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
  );
}

/** Revoke, with one confirm step. The key stops working at once; the row stays. */
export function RevokeControl({ onRevoke }: { onRevoke: () => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = async () => {
    setBusy(true);
    const err = await onRevoke();
    setBusy(false);
    setConfirming(false);
    setError(err);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <p className="basis-full text-[12px] text-red">{error}</p> : null}
      {confirming ? (
        <>
          <button type="button" className={buttonStyles.ghost} onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" className={`${buttonStyles.danger} text-red`} disabled={busy} onClick={() => void revoke()}>
            {busy ? "Revoking…" : "Revoke key"}
          </button>
        </>
      ) : (
        <button type="button" className={buttonStyles.quietDanger} onClick={() => setConfirming(true)}>
          Revoke
        </button>
      )}
    </div>
  );
}
