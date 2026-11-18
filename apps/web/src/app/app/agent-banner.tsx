"use client";
/**
 * The post sign-up banner: over every app page until a coding agent is connected, because the agent is
 * the point of the product (breaks go to it first) and it sets up GitHub and Vercel itself.
 * Hidden on the Agents page, where the connect form is. Polls every 30 s until an agent is live, then every
 * 5 min, so the banner comes back if the last agent is removed (the layout outlives page changes).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonStyles, surface } from "@/components/ui";
import { useApi } from "@/components/use-api";
import type { AgentsReport } from "@/lib/agents";
import { AGENT_START } from "./onboarding";

export function AgentBanner() {
  const pathname = usePathname();
  const agents = useApi<AgentsReport>("/api/v1/agents", { pollMs: (d) => (d && d.summary.live > 0 ? 300_000 : 30_000) });
  if (!agents.data || agents.data.summary.live > 0 || pathname.startsWith("/app/agents")) return null;
  return <AgentBannerView />;
}

/** Presentational, so the dev preview can draw it. */
export function AgentBannerView() {
  return (
    <section aria-label="Connect your coding agent" className={`mb-8 flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${surface}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[16px] leading-[1.3] font-medium text-fg">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
          Connect your coding agent
        </p>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-[1.55] text-pretty text-fg-2">
          Claude Code, Codex or Cursor. Paste one line and it sets up GitHub and Vercel with you. After that, breaks go to it first, with the cause.
        </p>
      </div>
      <Link href={AGENT_START} className={`${buttonStyles.primary} shrink-0 self-start sm:self-auto`}>
        Connect with an agent
      </Link>
    </section>
  );
}
