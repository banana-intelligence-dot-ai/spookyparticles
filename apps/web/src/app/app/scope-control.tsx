"use client";
/**
 * The user's call on a vendor: work or personal. Two buttons, the current one pressed.
 * Unknown vendors have neither pressed. Posts to /api/v1/vendors/{vendorKey}/scope.
 */
import type { VendorScope } from "./data-model";

export function ScopeControl({
  vendor,
  scope,
  busy,
  onChange,
}: {
  vendor: string;
  scope: VendorScope;
  busy: boolean;
  onChange: (next: "work" | "personal") => void;
}) {
  const opt = (value: "work" | "personal", label: string) => {
    const on = scope === value;
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={busy || on}
        onClick={() => onChange(value)}
        className={`inline-flex h-11 items-center rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] sm:h-8 sm:px-3 ${
          on ? "border-line-3 bg-raised-2 text-fg disabled:opacity-100" : "border-line-2 text-fg-2 hover:border-line-3 hover:text-fg disabled:opacity-50"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div role="group" aria-label={`Is ${vendor} work or personal?`} className="flex shrink-0 items-center gap-1.5">
      {opt("work", "This is work")}
      {opt("personal", "This is personal")}
    </div>
  );
}
