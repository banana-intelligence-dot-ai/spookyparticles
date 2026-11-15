import { Suspense } from "react";
import { NowView } from "./now-view";

export const metadata = { title: "Now" };

export default function NowPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <NowView />
      </Suspense>
    </div>
  );
}
