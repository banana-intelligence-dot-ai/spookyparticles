"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Footer, Wordmark } from "@/components/brand";
import { HelpPanel } from "@/components/help-panel";
import { useApi } from "@/components/use-api";
import { authClient } from "@/lib/auth-client";

/** Two places: your projects, and the accounts Spooky reads. */
export const RAIL_ITEMS = [
  { href: "/app", label: "Projects" },
  { href: "/app/connections", label: "Accounts" },
] as const;

/** Side features that left the nav. They keep working by URL and through the API. */
export const PARKED = [
  { href: "/app/findings", label: "Spend" },
  { href: "/app/services", label: "Services" },
  { href: "/app/expirations", label: "Expirations" },
] as const;

/** The small "More" list in the rail footer: the deeper pages first, then the parked ones. */
export const MORE = [
  { href: "/app/today", label: "Today" },
  { href: "/app/check", label: "Check" },
  { href: "/app/activity", label: "History" },
  { href: "/app/jobs", label: "Schedules" },
  ...PARKED,
] as const;

/** Projects is home: it owns /app and every project page under /app/projects. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app" || pathname.startsWith("/app/projects");
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Me = { user: { email: string; name: string } };

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useApi<Me>("/api/v1/me");
  return (
    <RailView
      pathname={pathname}
      email={me.data?.user.email ?? null}
      onSignOut={async () => {
        await authClient.signOut();
        router.push("/");
      }}
    />
  );
}

/** Presentational, so the dev preview can draw the real shell. */
export function RailView({ pathname, email, onSignOut }: { pathname: string; email: string | null; onSignOut: () => void }) {
  return (
    <aside className="flex shrink-0 flex-col border-b border-line-1 bg-bg-deep md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
      <div className="flex h-14 items-center justify-between pr-1 pl-4 md:h-16 md:px-5">
        <Wordmark href="/app" />
        {/* Phones: Help sits by the wordmark. Desktop: in the rail footer, where the rail has room. */}
        <div className="md:hidden">
          <HelpPanel />
        </div>
      </div>
      <nav className="flex gap-1 px-2 pb-2 md:flex-col md:px-3 md:pb-0" aria-label="App">
        {RAIL_ITEMS.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center rounded-lg px-3 text-[14px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fg/40 md:h-9 ${
                active ? "bg-raised-2 text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {/* Phones have no footer: the More list opens from the nav row. */}
        <details className="group relative shrink-0 md:hidden">
          <summary
            className={`flex h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-fg/40 [&::-webkit-details-marker]:hidden ${
              MORE.some((m) => isActive(m.href, pathname)) ? "bg-raised-2 text-fg" : "text-fg-2 hover:text-fg"
            }`}
          >
            More
            <svg viewBox="0 0 16 16" aria-hidden className="size-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className="absolute top-12 right-0 z-20 w-48 rounded-xl border border-line-2 bg-bg-deep p-1 shadow-lg">
            {MORE.map((m) => (
              <li key={m.href}>
                <Link href={m.href} aria-current={isActive(m.href, pathname) ? "page" : undefined} className="flex h-11 items-center rounded-lg px-3 text-[14px] text-fg-2 hover:bg-raised hover:text-fg aria-[current=page]:text-fg">
                  {m.label}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-line-1 pt-1">
              <button type="button" onClick={onSignOut} className="flex h-11 w-full items-center rounded-lg px-3 text-left text-[14px] text-fg-2 hover:bg-raised hover:text-fg">
                Sign out
              </button>
            </li>
          </ul>
        </details>
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
        <nav aria-label="More">
          <p className="text-[12px] text-fg-3">More</p>
          <ul className="mt-1 flex flex-col">
            {MORE.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href, pathname) ? "page" : undefined}
                  className="inline-flex h-7 items-center rounded text-[13px] text-fg-2 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/40 aria-[current=page]:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Footer className="text-[12px]" />
      </div>
    </aside>
  );
}
