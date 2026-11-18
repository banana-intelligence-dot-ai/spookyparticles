import { Suspense } from "react";
import { FeedbackView } from "./feedback-view";

export const metadata = { title: "Agent feedback" };

export default function FeedbackPage() {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <FeedbackView />
      </Suspense>
    </div>
  );
}
