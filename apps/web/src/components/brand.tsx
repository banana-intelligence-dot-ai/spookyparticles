import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-mono text-[16px] lowercase tracking-tight text-fg hover:text-fg">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="1.8 2.6" />
        <circle cx="16" cy="16" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="6.5" cy="21.5" r="3" fill="var(--accent)" />
      </svg>
      spooky particles
    </Link>
  );
}

export function Footer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-fg-2 ${className || "text-[14px]"}`}>
      <a href="https://bananaintelligence.ai?ref=spookyparticles" className="hover:text-fg">
        A Banana Intelligence product
      </a>
    </p>
  );
}
