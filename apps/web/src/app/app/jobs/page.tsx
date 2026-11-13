import { JobsView } from "./jobs-view";

export const metadata = { title: "Schedules" };

export default function JobsPage() {
  return (
    <div className="max-w-4xl">
      <JobsView />
    </div>
  );
}
