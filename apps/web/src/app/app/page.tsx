import { Suspense } from "react";
import { TodayView } from "./today-view";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <TodayView />
      </Suspense>
    </div>
  );
}
