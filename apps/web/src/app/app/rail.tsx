"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Footer, Wordmark } from "@/components/brand";
import { HelpPanel } from "@/components/help-panel";
import { useApi } from "@/components/use-api";
import { authClient } from "@/lib/auth-client";
import type { OpenReport } from "@/lib/open-items";

/**
 * Five places, in the order the owner asks about them: what is open now, what got fixed, the
 * projects, the agents, and the settings. Everything else is a page Settings links to.
 */
export const RAIL_ITEMS = [
  { href: "/app", label: "Now" },
  { href: "/app/history", label: "History" },
  { href: "/app/projects", label: "Projects" },
  { href: "/app/agents", label: "Agents" },
  { href: "/app/settings", label: "Settings" },
] as const;

/** Pages that left the rail. They keep working by URL and through the API; Settings lists them. */
export const MORE = [
  { href: "/app/check", label: "Check", what: "Setup suggestions for each project, most serious first." },
  { href: "/app/jobs", label: "Schedules", what: "Scheduled jobs and whether each ran on time." },
  { href: "/app/activity", label: "Activity", what: "Every deploy, sync and change Spooky saw or made." },
  { href: "/app/findings", label: "Spend", what: "Bills read from a connected inbox." },
  { href: "/app/services", label: "Services", what: "The services each project signed up for." },
  { href: "/app/expirations", label: "Expirations", what: "Domains, certificates and keys with an end date." },
] as const;

const under = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Now is exactly /app. Settings also owns the pages it links to, so the rail always shows where you are. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/settings") return under(href, pathname) || MORE.some((m) => under(m.href, pathname));
  return under(href, pathname);
}

export const FEEDBACK_ITEM = { href: "/app/feedback", label: "Agent feedback" } as const;

/** The feedback item shows only when the maker-only queue answered 200; anyone else (403, error, loading) sees nothing. */
export function feedbackNav(status: number | null, openCount: number): { href: string; label: string; count: number } | null {
  return status === 200 ? { ...FEEDBACK_ITEM, count: openCount } : null;
}

type Me = { user: { email: string; name: string } };

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useApi<Me>("/api/v1/me");
  const open = useApi<OpenReport>("/api/v1/open", { pollMs: () => 60_000 });
  // Non-makers get a 403 once and stop asking.
  const queue = useApi<{ posts: unknown[] }>("/api/v1/forum/queue", { pollMs: (d) => (d ? 60_000 : null) });
  return (
    <RailView
      pathname={pathname}
      email={me.data?.user.email ?? null}
      onYou={open.data?.summary.onYou ?? 0}
      feedback={feedbackNav(queue.status, queue.data?.posts.length ?? 0)}
      onSignOut={async () => {
        await authClient.signOut();
        router.push("/");
      }}
    />
  );
}

/** Presentational, so the dev preview can draw the real shell. */
export function RailView({ pathname, email, onYou = 0, feedback = null, onSignOut }: { pathname: string; email: string | null; onYou?: number; feedback?: ReturnType<typeof feedbackNav>; onSignOut: () => void }) {
  const items: { href: string; label: string; count: number }[] = RAIL_ITEMS.map((i) => ({ ...i, count: i.href === "/app" ? onYou : 0 }));
  if (feedback) items.push(feedback);
  return (
    <aside className="flex shrink-0 flex-col border-b border-line-1 bg-bg-deep md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
      <div className="flex h-14 items-center justify-between pr-1 pl-4 md:h-16 md:px-5">
        <Wordmark href="/app" />
        {/* Phones: Help sits by the wordmark. Desktop: in the rail footer, where the rail has room. */}
        <div className="md:hidden">
          <HelpPanel />
        </div>
      </div>
      <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 [scrollbar-width:none] md:flex-col md:gap-1 md:overflow-visible md:px-3 md:pb-0" aria-label="App">
        {items.map((item) => {
          const active = item.href === FEEDBACK_ITEM.href ? under(item.href, pathname) : isActive(item.href, pathname);
          const count = item.count;
          const isFeedback = item.href === FEEDBACK_ITEM.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[14px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fg/40 md:h-9 md:justify-between md:px-3 ${
                active ? "bg-raised-2 text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {item.label}
              {count ? (
                <span className="num inline-flex items-center gap-1.5 font-mono text-[12px] text-amber">
                  <span aria-hidden className="size-1.5 rounded-full bg-amber" />
                  {count}
                  <span className="sr-only">{isFeedback ? " open" : " on you"}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-2 pt-2 md:block">
        <HelpPanel />
      </div>
      <div className="hidden flex-col gap-3 border-t border-line-1 px-5 py-4 md:flex">
        {email ? (
          <p className="truncate text-[12px] text-fg-2" title={email}>
            {email}
          </p>
        ) : null}
        <button type="button" className="self-start text-[14px] text-fg-2 hover:text-fg" onClick={onSignOut}>
          Sign out
        </button>
        <Footer className="text-[12px]" />
      </div>
    </aside>
  );
}
