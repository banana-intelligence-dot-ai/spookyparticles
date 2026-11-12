import { Suspense } from "react";
import { CheckView } from "./check-view";

export const metadata = { title: "Check" };
export default function CheckPage() {
  return <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}><CheckView /></Suspense>;
}
