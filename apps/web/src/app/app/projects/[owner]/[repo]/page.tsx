import { Suspense } from "react";
import { ProjectPageView } from "../../../project-page-view";

type Params = Promise<{ owner: string; repo: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { owner, repo } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}` };
}

// With cacheComponents on, the params read has to sit under a Suspense boundary
// so the shell prerenders and the project streams in; without it the build fails.
export default function ProjectPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: Params }) {
  const { owner, repo } = await params;
  return <ProjectPageView owner={decodeURIComponent(owner)} repo={decodeURIComponent(repo)} />;
}
