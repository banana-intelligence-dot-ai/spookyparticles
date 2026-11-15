import { notFound } from "next/navigation";
import { Suspense } from "react";
import { nowFixture } from "./now-fixture";
import { Preview } from "./preview";
import { VIEWS, type View } from "./views";

export const metadata = { title: "App preview" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Development-only: the real app screens against fixtures.
 * `?state=<key>&view=now|history|projects|agents|settings|...`. 404 in every other environment.
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
  const v: View = VIEWS.includes(view as View) ? (view as View) : "now";
  const key = typeof state === "string" ? state : null;
  // Now and Agents come from the real builders, which are server code: build here, hand down.
  return <Preview only={key} view={v} fixture={nowFixture(key)} />;
}
