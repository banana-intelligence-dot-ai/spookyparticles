import { Suspense } from "react";
import { HomeView } from "./home-view";

export const metadata = { title: "Projects" };

export default function HomePage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <HomeView />
      </Suspense>
    </div>
  );
}
