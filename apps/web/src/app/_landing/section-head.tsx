import type { ReactNode } from "react";

/** The one heading system for the landing page: a small mono eyebrow in the accent, then a 52 px heading. */
export function SectionHead({ id, eyebrow, title, sub, className = "" }: { id: string; eyebrow: string; title: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="font-mono text-[12px] tracking-[0.08em] text-accent uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-4 text-[36px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-fg sm:text-[52px] sm:leading-[1.04]">
        {title}
      </h2>
      {sub ? <p className="mt-5 max-w-[44ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[18px]">{sub}</p> : null}
    </div>
  );
}

/** Space between landing sections: 128 px at desktop, no rule. */
export const SECTION_GAP = "mt-24 sm:mt-32";
