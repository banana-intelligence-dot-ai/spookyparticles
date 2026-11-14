import { Suspense } from "react";
import { ProjectPageView } from "../../../../project-page-view";

type Params = Promise<{ owner: string; repo: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { owner, repo } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}: deploys and stack` };
}

/** The full record for one project: deploys, domains, services and bills, each with its source. */
export default function ProjectDetailsPage({ params }: { params: Params }) {
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
