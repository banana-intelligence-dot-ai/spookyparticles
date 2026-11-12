import { notFound } from "next/navigation";
import { VercelConnectPreview } from "./preview";

/** Dev-only preview of the Vercel token panel, outside a session. A 404 outside development. */
export default function DevConnectPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-8">
      <VercelConnectPreview />
    </div>
  );
}
