import Link from "next/link";
import { Footer, Wordmark } from "@/components/brand";
import { LegalDocument } from "@/lib/legal-markdown";
import { DOCS_PAGES } from "./pages";

function Nav({ current }: { current?: string }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-md px-2 text-[14px] lg:min-h-8 ${active ? "bg-raised-2 text-fg" : "text-fg-2 hover:text-fg"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Docs" className="flex flex-col">
      {link("/docs", "Overview", current === undefined)}
      {DOCS_PAGES.map((p) => link(`/docs/${p.slug}`, p.title, current === p.slug))}
    </nav>
  );
}

/** Frame for /docs: wordmark, left nav (stacked above the page on mobile), the document, footer. */
export function DocsFrame({ markdown, current }: { markdown: string; current?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Wordmark />
        <nav className="flex gap-5 text-[14px] text-fg-2">
          <Link href="/docs" className="text-fg">Docs</Link>
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </nav>
      </header>
      <div className="flex flex-1 flex-col gap-6 py-8 lg:flex-row lg:gap-12 lg:py-12">
        <aside className="shrink-0 border-b border-line-1 pb-4 lg:w-52 lg:border-b-0 lg:pb-0">
          <div className="lg:sticky lg:top-8">
            <Nav current={current} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <LegalDocument markdown={markdown} />
        </main>
      </div>
      <footer className="flex min-h-16 items-center border-t border-line-1 py-2">
        <Footer />
      </footer>
    </div>
  );
}
