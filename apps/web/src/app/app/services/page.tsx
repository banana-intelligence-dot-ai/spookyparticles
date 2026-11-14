import { Suspense } from "react";
import { ServicesView } from "../check/check-view";

export const metadata = { title: "Services" };
export default function Page() {
  return <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}><ServicesView /></Suspense>;
}
