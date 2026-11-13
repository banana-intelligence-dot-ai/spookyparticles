import { ActivityView } from "../activity-view";

export const metadata = { title: "History" };

export default function ActivityPage() {
  return (
    <div className="max-w-4xl">
      <ActivityView />
    </div>
  );
}
