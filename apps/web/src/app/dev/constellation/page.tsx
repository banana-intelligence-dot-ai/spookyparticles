import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { Ledger, Orbits, Wiring } from "./directions";

export const metadata = { title: "Landing chart directions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DIRECTIONS = { wiring: Wiring, orbits: Orbits, ledger: Ledger } as const;
type Key = keyof typeof DIRECTIONS;

/**
 * Development-only: three candidate replacements for the landing constellation, on one
 * sample account. `?v=wiring|orbits|ledger` shows one; no param shows all three. 404 elsewhere.
 */
export default function ChartDirections({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>
      <main className="flex flex-col gap-24 pt-6 pb-24">
        <Suspense>
          <Chosen searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Chosen({ searchParams }: { searchParams: SearchParams }) {
  const { v } = await searchParams;
  const keys: Key[] = typeof v === "string" && v in DIRECTIONS ? [v as Key] : (Object.keys(DIRECTIONS) as Key[]);
  return keys.map((k) => {
    const D = DIRECTIONS[k];
    return <D key={k} />;
  });
}
