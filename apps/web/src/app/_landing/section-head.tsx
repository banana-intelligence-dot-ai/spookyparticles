import type { ReactNode } from "react";

/** The one heading system for the landing page: a 52 px heading and an optional line under it. No eyebrow labels. */
export function SectionHead({ id, title, sub, className = "" }: { id: string; title: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 id={id} className="text-[36px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-fg sm:text-[52px] sm:leading-[1.04]">
        {title}
      </h2>
      {sub ? <p className="mt-5 max-w-[44ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[18px]">{sub}</p> : null}
    </div>
  );
}

/** Space between landing sections: 128 px at desktop, no rule. */
export const SECTION_GAP = "mt-24 sm:mt-32";
