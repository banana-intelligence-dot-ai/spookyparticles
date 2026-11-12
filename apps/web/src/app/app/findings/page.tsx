import { Suspense } from "react";
import { SpendView } from "./spend-view";

export const metadata = { title: "Spend" };

export default function SpendPage() {
  return (
    <div className="max-w-4xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <SpendView />
      </Suspense>
    </div>
  );
}
