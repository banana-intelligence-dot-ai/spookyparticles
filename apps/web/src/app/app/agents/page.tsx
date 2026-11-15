import { Suspense } from "react";
import { AgentsView } from "./agents-view";

export const metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <AgentsView />
      </Suspense>
    </div>
  );
}
