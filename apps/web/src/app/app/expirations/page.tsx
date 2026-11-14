import { Suspense } from "react";
import { ExpirationsView } from "../check/check-view";

export const metadata = { title: "Expirations" };
export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}><ExpirationsView /></Suspense>;
}
