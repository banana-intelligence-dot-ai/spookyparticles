import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/app/terms/legal-page";
import { referencePage, type SpookyTie } from "@/lib/reference-pages";

const BASE = "https://spookyparticles.com";
/** The tagline, word for word. Change it only with the homepage. */
export const REFERENCE_BANNER = "Tells your coding agent when an app you shipped breaks.";

/** The one line under the banner, from the page's `spooky` field. Every word checked against the code. */
export const SPOOKY_LINES: Record<SpookyTie, string> = {
  no: "Spooky doesn't catch this one.",
  deploy: "When a deploy fails, Spooky passes the build log line to your coding agent.",
  runtime: "When server errors like this rise, Spooky tells your coding agent, if it can read the project's request history on Vercel.",
  site: "If your site's main address starts failing like this, Spooky alerts after two failed checks in a row.",
};

export function referenceMetadata(slug: string): Metadata {
  const p = referencePage(slug);
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/${p.slug}` },
    openGraph: { type: "article", siteName: "spooky particles", url: `/${p.slug}`, images: ["/opengraph-image"], title: p.title, description: p.description, publishedTime: p.published, modifiedTime: p.checked },
  };
}

/** One reference page: the Spooky banner, then the Markdown, with TechArticle JSON-LD. The body makes its own claims, or none. */
export function ReferencePage({ slug }: { slug: string }) {
  const p = referencePage(slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: p.title,
    description: p.description,
    datePublished: p.published,
    dateModified: p.checked,
    url: `${BASE}/${p.slug}`,
    mainEntityOfPage: `${BASE}/${p.slug}`,
    inLanguage: "en",
    publisher: { "@type": "Organization", name: "Banana Intelligence LLC", url: BASE },
  };
  const banner = (
    <div className="border-y border-line-1 py-3 text-[14px] text-fg-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{REFERENCE_BANNER}</span>
        <Link href="/" className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
          Spooky Particles
        </Link>
      </p>
      <p className="mt-1">{SPOOKY_LINES[p.spooky]}</p>
    </div>
  );
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={p.body} above={banner} />
    </>
  );
}
