import Link from "next/link";
import { Footer, Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col items-start justify-center gap-6 py-16">
        <svg viewBox="0 0 120 120" className="w-24" aria-hidden>
          <g fill="none" stroke="var(--fg)" strokeDasharray="2 4">
            <circle cx="60" cy="60" r="22" strokeOpacity="0.18" />
            <circle cx="60" cy="60" r="38" strokeOpacity="0.12" />
            <circle cx="60" cy="60" r="54" strokeOpacity="0.07" />
          </g>
          <circle cx="60" cy="60" r="5" fill="var(--bg)" stroke="var(--fg)" strokeWidth="1.25" />
        </svg>
        <p className="font-mono text-[14px] text-fg-2">404</p>
        <h1 className="font-mono text-[32px] leading-[1.15] font-medium tracking-[-0.02em] text-balance text-fg">
          Nothing observed at this address.
        </h1>
        <Link href="/" className="text-[16px] text-fg-2 underline decoration-line-3 underline-offset-4 hover:text-fg">
          Back to spooky particles
        </Link>
      </main>
      <footer className="flex h-16 items-center border-t border-line-1">
        <Footer />
      </footer>
    </div>
  );
}
