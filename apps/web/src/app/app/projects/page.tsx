import { Suspense } from "react";
import { ProjectsView } from "../projects-view";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
      <ProjectsView />
    </Suspense>
  );
}
