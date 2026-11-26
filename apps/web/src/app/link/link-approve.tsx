"use client";
/**
 * The approve card. Reads who is asking through GET /api/v1/device/approve (session only) and
 * decides through POST. The browser only ever sees the short code, never the agent's secret.
 */
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiPost, errorMessage, SIGNED_OUT, useApi } from "@/components/use-api";
import { buttonStyles, surface } from "@/components/ui";
import { normalizeUserCode } from "@/lib/device-code";
import { linkReturnTo } from "@/lib/sign-in-notice";
import { isRunning, type Connection } from "../app/connection-model";
import { Onboarding, onboardingComplete } from "../app/onboarding";

type Asking = {
  userCode: string;
  clientLabel: string;
  machine: string;
  access: "read" | "write";
  status: "pending" | "approved" | "denied";
};

type View =
  | { kind: "enter" }
  | { kind: "loading" }
  | { kind: "ask"; req: Asking }
  | { kind: "done"; approved: boolean; access: "read" | "write" }
  | { kind: "message"; text: string; signIn?: boolean };

const field =
  "h-11 w-full rounded-lg border border-line-2 bg-transparent px-3 font-mono text-[16px] tracking-[0.08em] text-fg uppercase placeholder:text-fg-3 placeholder:normal-case placeholder:tracking-normal hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const big = "sm:h-11! sm:px-5! sm:text-[15px]!";

export function LinkApprove() {
  const params = useSearchParams();
  const initial = params.get("code") ?? "";
  const [code, setCode] = useState(initial);
  const [view, setView] = useState<View>({ kind: initial ? "loading" : "enter" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async (input: string) => {
    const userCode = normalizeUserCode(input);
    if (!userCode) {
      setView({ kind: "enter" });
      setError("That is not a code. It looks like BCDF-GHJK.");
      return;
    }
    setError(null);
    setView({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/device/approve?userCode=${encodeURIComponent(userCode)}`, { credentials: "same-origin", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const req = body as Asking;
        if (req.status === "approved") setView({ kind: "message", text: "This code was already approved. Go back to your terminal." });
        else if (req.status === "denied") setView({ kind: "message", text: "This code was denied. Start again in your terminal if that was a mistake." });
        else setView({ kind: "ask", req });
      } else if (res.status === 404) {
        setView({ kind: "message", text: "That code is not one we know, or it expired. Codes last ten minutes. Start again in your terminal." });
      } else {
        const text = errorMessage(res.status, body);
        setView({ kind: "message", text, signIn: text === SIGNED_OUT });
      }
    } catch {
      setView({ kind: "message", text: "Network error. Check your connection and reload." });
    }
  }, []);

  useEffect(() => {
    if (initial) void look(initial);
  }, [initial, look]);

  const decide = async (userCode: string, access: "read" | "write", approve: boolean) => {
    setBusy(true);
    setError(null);
    const r = await apiPost<{ status: string }>("/api/v1/device/approve", { userCode, approve });
    setBusy(false);
    if (r.ok) setView({ kind: "done", approved: approve, access });
    else if (r.status === 404) setView({ kind: "message", text: "That code expired before it was decided. Start again in your terminal." });
    else setError(r.error ?? "That didn't save. Try again.");
  };

  if (view.kind === "loading") return <p className="text-[14px] text-fg-3">Looking up that code…</p>;

  if (view.kind === "done") return view.approved ? <ApprovedNext access={view.access} /> : <Denied />;

  if (view.kind === "ask") {
    const { req } = view;
    const agentName = req.clientLabel || "An agent";
    const accessWords =
      req.access === "write"
        ? "Also create, change and remove check-ins, monitors, expirations and alert channels, acknowledge alerts, and disconnect accounts. It can't see secret values or approve fixes. Expires in 90 days."
        : "See your projects, check-ins and alerts. It can't change anything.";
    return (
      <div>
        <h1 className="text-[24px] leading-[1.25] font-medium tracking-[-0.01em] text-balance text-fg">
          {agentName} wants {req.access} access.
        </h1>
        <p className="mt-2 text-[14px] text-fg-2">
          It says it is on <span className="font-mono text-fg">{req.machine}</span>.
        </p>
        <p className="mt-3 text-[14px] text-pretty text-fg-2">{accessWords}</p>
        <div className={`mt-8 px-5 py-6 sm:px-6 ${surface}`}>
          <p className="font-mono text-[40px] leading-none font-medium tracking-[0.12em] text-fg sm:text-[48px]">{req.userCode}</p>
          <p className="mt-3 text-[14px] text-fg-2">Check it matches the code in your terminal.</p>
        </div>
        <p className="mt-6 text-[14px] text-pretty text-amber">Only approve if you just started this on your own computer.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={`${buttonStyles.primary} ${big}`} disabled={busy} onClick={() => void decide(req.userCode, req.access, true)}>
            {busy ? "Saving…" : `Approve ${req.access} access`}
          </button>
          <button type="button" className={`${buttonStyles.secondary} ${big}`} disabled={busy} onClick={() => void decide(req.userCode, req.access, false)}>
            Deny
          </button>
        </div>
        <p className="mt-5 text-[14px] text-fg-2">It gets a {req.access} key named {agentName} on {req.machine}.</p>
        {error ? <p className="mt-3 text-[14px] text-red">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[24px] leading-[1.2] font-medium tracking-[-0.01em] text-fg">Connect an agent</h1>
      {view.kind === "message" ? (
        <p role="status" className="mt-3 text-[14px] text-pretty text-fg-2">
          {view.text}
          {view.signIn ? (
            <>
              {" "}
              <a
                href={`/?signin=required&returnTo=${encodeURIComponent(linkReturnTo(normalizeUserCode(code)))}`}
                className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg"
              >
                Sign in
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-3 text-[14px] text-pretty text-fg-2">Type the code your terminal shows.</p>
      )}
      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void look(code);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BCDF-GHJK"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            className={field}
          />
        </label>
        <button type="submit" className={`${buttonStyles.secondary} ${big}`}>
          Continue
        </button>
      </form>
      {error ? <p className="mt-3 text-[14px] text-red">{error}</p> : null}
    </div>
  );
}

function Denied() {
  return (
    <div role="status">
      <h1 className="text-[24px] leading-[1.2] font-medium tracking-[-0.01em] text-fg">Denied. Nothing was shared.</h1>
      <p className="mt-3 text-[14px] text-pretty text-fg-2">You can close this tab.</p>
    </div>
  );
}

const revokeNote = (
  <>
    You can see its key and revoke it any time under{" "}
    <a href="/app/agents" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
      Agents
    </a>
    .
  </>
);

/**
 * After Approve, the same page carries the rest of setup: connect GitHub and Vercel here, and the
 * agent waiting in the terminal picks up when both finish a first read. Once both are synced it
 * says go back to the terminal, which is all a returning user ever sees.
 */
function ApprovedNext({ access }: { access: "read" | "write" }) {
  const conns = useApi<{ connections: Connection[] }>("/api/v1/connections", {
    pollMs: (d) => (d?.connections.some((c) => isRunning(c.sync)) ? 5000 : null),
  });
  const params = useSearchParams();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [conns.data]);
  const list = conns.data?.connections ?? null;

  if (!list || now === null || onboardingComplete(list)) {
    return (
      <div role="status">
        <h1 className="text-[24px] leading-[1.2] font-medium tracking-[-0.01em] text-fg">Approved. Go back to your terminal.</h1>
        <p className="mt-3 text-[14px] text-pretty text-fg-2">Your agent has its {access} key now. {revokeNote}</p>
      </div>
    );
  }
  return (
    <div>
      <div role="status">
        <h1 className="text-[24px] leading-[1.2] font-medium tracking-[-0.01em] text-balance text-fg">Approved. Now connect GitHub and Vercel.</h1>
        <p className="mt-3 text-[14px] text-pretty text-fg-2">
          Both are read-only. Your agent is waiting in the terminal and shows you what it found once both finish their first read.
        </p>
      </div>
      <div className="mt-8">
        <Onboarding connections={list} params={params} now={now} />
      </div>
      <p className="text-[14px] text-pretty text-fg-3">{revokeNote}</p>
    </div>
  );
}
