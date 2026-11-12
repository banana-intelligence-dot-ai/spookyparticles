/**
 * The "how it works" pages: one markdown file each in content/how/<slug>.md, rendered by
 * /how/[slug]. Each entry feeds the page's metadata, its Article JSON-LD and the sitemap;
 * llms.txt lists them by hand so every line there stays a sentence a person wrote.
 * Dates are the day the text was last checked against the code, not a publish date.
 */
export type HowPage = {
  slug: string;
  title: string;
  description: string;
  /** ISO date of first publication. */
  published: string;
  /** ISO date the text was last checked against the code. */
  checked: string;
};

export const HOW_PAGES: HowPage[] = [
  {
    slug: "apps-across-hosts-and-logins",
    title: "How Spooky maps Vercel and your other apps",
    description:
      "How Vercel and GitHub build one map of projects, schedules, deploys and domains. See what each read-only connection can show.",
    published: "2026-11-03",
    checked: "2026-11-10",
  },
  {
    slug: "email-into-an-ops-record",
    title: "Optional email for bills and renewals",
    description:
      "A read-only Gmail inbox can add bills and renewals by request. It is optional for Vercel alerts and the map.",
    published: "2026-11-03",
    checked: "2026-11-10",
  },
];

export const howPage = (slug: string) => HOW_PAGES.find((p) => p.slug === slug) ?? null;
