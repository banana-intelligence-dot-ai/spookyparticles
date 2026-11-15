import { Suspense } from "react";
import { ProjectsListView } from "../projects-list";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <ProjectsListView />
      </Suspense>
    </div>
  );
}
