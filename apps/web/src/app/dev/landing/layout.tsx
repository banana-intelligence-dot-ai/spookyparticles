import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata = { title: "Landing directions" };

/** Development-only: five home page directions to choose from. 404 everywhere else. */
export default function LandingDirectionsLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
