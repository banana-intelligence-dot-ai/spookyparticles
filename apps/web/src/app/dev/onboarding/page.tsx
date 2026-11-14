import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Preview } from "./preview";
import { VIEWS, type View } from "./views";

export const metadata = { title: "App preview" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Development-only: the real app screens against fixtures.
 * `?state=<key>&view=home|project|connections|today|projects|details|...`. 404 in every other environment.
 */
export default function AppPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <Suspense>
      <Filtered searchParams={searchParams} />
    </Suspense>
  );
}

async function Filtered({ searchParams }: { searchParams: SearchParams }) {
  const { state, view } = await searchParams;
  const v: View = VIEWS.includes(view as View) ? (view as View) : "home";
  return <Preview only={typeof state === "string" ? state : null} view={v} />;
}
