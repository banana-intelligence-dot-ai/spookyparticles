/**
 * "Billing mail so far": the early result on Spend. Vendors that send billing mail to
 * the connected inboxes, from headers only, minutes after connecting and long before
 * extraction. Presentational; MapView fetches /api/v1/mail/vendors.
 */
import { SectionTitle, surface } from "@/components/ui";
import { formatInt } from "@/components/use-api";

export type VendorSummary = {
  /** Display name from the sender table, e.g. "Vercel". */
  vendor: string;
  category: "hosting" | "database" | "domains" | "dns_cdn" | "ai" | "payments_processor" | "dev_tools" | "saas" | null;
  messages: number;
  inboxes: number;
  firstAt: string | null;
  lastAt: string | null;
};

export type VendorsReport = { vendors: VendorSummary[]; unmatched: number; messages: number; inboxes: number };

const CATEGORY: Record<NonNullable<VendorSummary["category"]>, string> = {
  hosting: "Hosting",
  database: "Database",
  domains: "Domains",
  dns_cdn: "DNS and CDN",
  ai: "AI",
  payments_processor: "Payments",
  dev_tools: "Dev tools",
  saas: "SaaS",
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "last week". Under a minute reads "just now". */
export function relativeTime(iso: string, now: number): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const absolute = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

export function BillingMail({
  report,
  now,
  showEmpty = true,
}: {
  report: VendorsReport | null;
  /** The caller's clock, read in an effect: never Date.now() during render. */
  now: number;
  /** The empty line is redundant while the Setup panel already says when results start. */
  showEmpty?: boolean;
}) {
  if (!report || report.messages === 0) {
    if (!showEmpty) return null;
    return (
      <section aria-labelledby="billing-mail-title" className="mb-16">
        <SectionTitle id="billing-mail-title">Billing mail so far</SectionTitle>
        <p className="text-[14px] text-fg-3">First results show within a minute of connecting an inbox.</p>
      </section>
    );
  }

  const { vendors, unmatched } = report;
  const billing = vendors.reduce((n, v) => n + v.messages, 0) + unmatched;
  return (
    <section aria-labelledby="billing-mail-title" className="mb-16">
      <SectionTitle id="billing-mail-title">Billing mail so far</SectionTitle>

      <div className={`overflow-hidden ${surface}`}>
        <div className="border-b border-line-1 px-4 pt-5 pb-4 sm:px-6">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num font-mono text-[32px] leading-none font-medium tracking-[-0.02em] text-fg">
              {formatInt(billing)}
            </span>
            <span className="text-[14px] text-fg-2">
              billing {billing === 1 ? "email" : "emails"} · {plural(vendors.length, "known vendor", "known vendors")}
            </span>
          </p>
          <p className="mt-2 text-[12px] text-fg-3">{plural(report.inboxes, "inbox", "inboxes")}, read from headers only.</p>
        </div>

        {vendors.length ? (
          <>
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,1fr)_96px_128px] gap-4 border-b border-line-1 px-4 py-2 text-[12px] text-fg-3 sm:grid sm:px-6"
            >
              <span>Vendor</span>
              <span className="text-right">Emails</span>
              <span className="text-right">Last seen</span>
            </div>
            <ul>
              {vendors.map((v) => (
                <li
                  key={v.vendor}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line-1 px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_96px_128px] sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-fg">{v.vendor}</p>
                    <p className="truncate text-[12px] text-fg-3">
                      {v.category ? CATEGORY[v.category] : "Uncategorized"}
                      {v.inboxes > 1 ? ` · ${plural(v.inboxes, "inbox", "inboxes")}` : ""}
                      {v.lastAt ? <span className="sm:hidden"> · {relativeTime(v.lastAt, now)}</span> : null}
                    </p>
                  </div>
                  <p className="num text-right font-mono text-[14px] text-fg">{formatInt(v.messages)}</p>
                  <p
                    className="hidden text-right text-[14px] text-fg-2 sm:block"
                    title={v.lastAt ? absolute(v.lastAt) : undefined}
                  >
                    {v.lastAt ? relativeTime(v.lastAt, now) : "Unknown"}
                  </p>
                </li>
              ))}
              {unmatched > 0 ? (
                <li className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_96px_128px] sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-fg-2">Unmatched senders</p>
                    <p className="truncate text-[12px] text-fg-3">Look like billing mail, not on the vendor list yet</p>
                  </div>
                  <p className="num text-right font-mono text-[14px] text-fg-2">{formatInt(unmatched)}</p>
                  <span className="hidden sm:block" />
                </li>
              ) : null}
            </ul>
          </>
        ) : (
          <p className="px-4 py-4 text-[14px] text-fg-3 sm:px-6">
            {plural(report.messages, "email", "emails")} read so far. None from a billing sender we know yet.
          </p>
        )}
      </div>
    </section>
  );
}
