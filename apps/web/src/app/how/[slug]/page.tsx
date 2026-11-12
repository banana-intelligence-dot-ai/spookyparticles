import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "../../terms/legal-page";
import { HOW_PAGES, howPage } from "../pages";

const BASE = "https://spookyparticles.com";

export function generateStaticParams() {
  return HOW_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = howPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/how/${page.slug}` },
    openGraph: { type: "article", siteName: "spooky particles", url: `/how/${page.slug}`, images: ["/opengraph-image"], title: page.title, description: page.description, publishedTime: page.published, modifiedTime: page.checked },
  };
}

/** A "how it works" page: the markdown in content/how/<slug>.md plus Article JSON-LD built from pages.ts. */
export default async function HowItWorksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = howPage(slug);
  if (!page) notFound();
  const md = readFileSync(path.join(process.cwd(), "content/how", `${page.slug}.md`), "utf8");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    datePublished: page.published,
    dateModified: page.checked,
    url: `${BASE}/how/${page.slug}`,
    mainEntityOfPage: `${BASE}/how/${page.slug}`,
    inLanguage: "en",
    author: { "@type": "Person", name: "Nate Peace" },
    publisher: { "@type": "Organization", name: "Banana Intelligence LLC", url: BASE },
    about: { "@type": "SoftwareApplication", name: "Spooky Particles", url: BASE, applicationCategory: "DeveloperApplication" },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <LegalPage markdown={md} />
    </>
  );
}
