import { JobsView } from "./jobs-view";

export const metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <div className="max-w-4xl">
      <JobsView />
    </div>
  );
}
