import Link from "next/link";
import { Footer, Wordmark } from "@/components/brand";
import { LegalDocument } from "@/lib/legal-markdown";

/** Shared frame for /privacy and /terms: wordmark, the document, footer. */
export function LegalPage({ markdown }: { markdown: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        <Wordmark />
        <nav className="flex gap-5 text-[14px] text-fg-2">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </nav>
      </header>
      <main className="flex-1 py-12">
        <LegalDocument markdown={markdown} />
      </main>
      <footer className="flex h-16 items-center border-t border-line-1">
        <Footer />
      </footer>
    </div>
  );
}
