import { Suspense } from "react";
import { HistoryView } from "../history-view";

export const metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <HistoryView />
      </Suspense>
    </div>
  );
}
