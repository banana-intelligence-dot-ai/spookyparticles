import type { ReactNode } from "react";

/** Raised surface: hairline, 16px radius, 1px top highlight. Shared by lists and panels. */
export const surface = "rounded-2xl border border-line-2 bg-raised shadow-[inset_0_1px_0_var(--highlight)]";

/** The universal list row: label, value, one action. */
export function Row({ label, value, meta, action }: { label: ReactNode; value: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex min-h-12 items-center gap-4 border-b border-line-1 px-4 py-2.5 last:border-b-0">
      <div className="w-28 shrink-0 text-[14px] text-fg-2">{label}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[14px] text-fg">{value}</div>
        {meta ? <div className="truncate font-mono text-[12px] text-fg-3">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </li>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className={`overflow-hidden ${surface}`}>{children}</ul>;
}

export function PageHeader({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-balance text-fg">{title}</h1>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
      {lede ? <p className="mt-2 max-w-[70ch] text-[16px] leading-[1.5] text-pretty text-fg-2">{lede}</p> : null}
    </header>
  );
}

/** A section title (20px, the middle of the scale) with an optional count beside it. */
export function SectionTitle({ id, children, count, action }: { id?: string; children: ReactNode; count?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="flex items-baseline gap-3 text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg">
        {children}
        {count !== undefined ? <span className="num text-[14px] font-normal tracking-normal text-fg-2">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}

/**
 * Status as a 6px dot plus a word. Connection "errored" is amber: it needs the user, but nothing
 * is down. Deployment "error" and "failure" stay red. "syncing" is a hollow accent ring.
 */
const STATUS: Record<string, string> = {
  active: "bg-accent",
  success: "bg-accent",
  done: "bg-accent",
  syncing: "ring-1 ring-inset ring-accent",
  errored: "bg-amber",
  stopped: "bg-amber",
  paused: "bg-amber",
  failure: "bg-red",
  error: "bg-red",
  revoked: "bg-fg-3",
  inactive: "bg-fg-3",
  archived: "bg-fg-3",
};

export function Status({ value, label }: { value: string | null | undefined; label?: string }) {
  const v = value ?? "unknown";
  return (
    <span className="inline-flex items-center gap-2 text-[12px] leading-none whitespace-nowrap text-fg-2">
      <span className={`size-1.5 shrink-0 rounded-full ${STATUS[v] ?? "bg-fg-3"}`} aria-hidden />
      {label ?? v}
    </span>
  );
}

/** 44px tall on touch screens, 32px from sm up. Press scales to 0.97. */
const button =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:h-8 sm:px-3.5";

export const buttonStyles = {
  /** Moves the user forward (install, connect). The accent marks progress, never a repair. */
  primary: `${button} bg-accent text-accent-ink hover:brightness-110`,
  /** Repairs something (reconnect, fix an install). Ink, so green keeps meaning "healthy". */
  repair: `${button} bg-fg text-bg hover:bg-fg/90`,
  secondary: `${button} border border-line-2 text-fg hover:border-line-3 hover:bg-raised-2`,
  ghost: `${button} text-fg-2 hover:bg-raised-2 hover:text-fg`,
  danger: `${button} border border-line-2 text-fg-2 hover:border-red/50 hover:text-red`,
  /** Quiet destructive: text until hovered. The confirm step uses `danger`. */
  quietDanger: `${button} text-fg-3 hover:bg-raised-2 hover:text-red`,
};

/** One sentence of what will be here, then the way to make it happen. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`px-5 py-8 sm:px-6 ${surface}`}>
      <p className="text-[16px] leading-[1.3] font-medium text-fg">{title}</p>
      {children ? <div className="mt-2 max-w-[60ch] text-[14px] text-pretty text-fg-2">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** A 2px determinate track. Only with a count beside it, never a bare percent. */
export function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-0.5 w-full overflow-hidden rounded-full bg-line-2"
    >
      <div
        className="h-full origin-left rounded-full bg-fg transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}

/** An error line. A signed-out session gets the way back in beside it. */
export function ErrorLine({ message }: { message: string }) {
  return (
    <p className="mb-6 text-[14px] text-red">
      {message}
      {message === "You're signed out." ? (
        <>
          {" "}
          <a href="/" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
            Sign in
          </a>
        </>
      ) : null}
    </p>
  );
}

/** Disclosure chevron: points right, turns down when open. */
export function Chevron({ open, className = "size-3.5" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`${className} shrink-0 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Filter chips: a segmented row of words with counts. One is always on. Scrolls
 * sideways on a phone instead of wrapping into a wall.
 */
export function Chips<K extends string>({
  label,
  value,
  options,
  onChange,
  wrap = false,
}: {
  label: string;
  value: K;
  options: { key: K; label: string; count?: number; tone?: "red" | "amber" }[];
  onChange: (k: K) => void;
  /** Wrap onto a second line on a phone instead of scrolling sideways (for a filter that must stay visible). */
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        wrap
          ? "flex flex-wrap gap-1"
          : "-mx-4 flex gap-1 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none]"
      }
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-[background-color,border-color,color] duration-150 ease-out sm:h-8 sm:px-3 ${
              on ? "border-line-3 bg-raised-2 text-fg" : "border-transparent text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            {o.tone ? <span aria-hidden className={`size-1.5 rounded-full ${o.tone === "red" ? "bg-red" : "bg-amber"}`} /> : null}
            {o.label}
            {o.count !== undefined ? <span className={`num font-mono text-[12px] ${on ? "text-fg-2" : "text-fg-3"}`}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A caption built from parts. Each part carries its own separator in a gutter on its left, and the
 * row is pulled left by that gutter and clipped, so whichever part starts a line has its separator
 * cut off. No line ever starts with a "·", and wrapped text inside a part lines up with the part.
 */
export function Parts({ className = "", children }: { className?: string; children: ReactNode[] }) {
  return (
    <p className={`overflow-x-clip ${className}`}>
      <span className="-ml-[1.25em] flex flex-wrap items-baseline">
        {children.map((part, i) => (
          <span
            key={i}
            className="relative min-w-0 pl-[1.25em] before:absolute before:left-0 before:w-[1.25em] before:text-center before:text-fg-3 before:content-['·']"
          >
            {part}
          </span>
        ))}
      </span>
    </p>
  );
}
