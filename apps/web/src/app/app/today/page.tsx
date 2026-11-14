import { Suspense } from "react";
import { TodayView } from "../today-view";

export const metadata = { title: "Today" };

/** The old home, kept whole: the catch chart, the agents who listen, and the ranked to-do list. */
export default function TodayPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <TodayView />
      </Suspense>
    </div>
  );
}
