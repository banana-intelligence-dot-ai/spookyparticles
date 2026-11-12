"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Footer, Wordmark } from "@/components/brand";
import { useApi } from "@/components/use-api";
import { authClient } from "@/lib/auth-client";

export const RAIL_ITEMS = [
  { href: "/app", label: "Today" },
  { href: "/app/projects", label: "Projects" },
  { href: "/app/check", label: "Check" },
  { href: "/app/findings", label: "Spend" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/jobs", label: "Jobs" },
  { href: "/app/connections", label: "Connections" },
] as const;

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
      <div className="flex h-14 items-center px-4 md:h-16 md:px-5">
        <Wordmark href="/app" />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] md:flex-col md:px-3 md:pb-0 md:[mask-image:none]" aria-label="App">
        {RAIL_ITEMS.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center rounded-lg px-3 text-[14px] transition-colors md:h-9 ${
                active ? "bg-raised-2 text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden flex-col gap-3 border-t border-line-1 px-5 py-4 md:flex">
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
