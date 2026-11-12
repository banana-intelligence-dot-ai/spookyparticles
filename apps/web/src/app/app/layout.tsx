import { Suspense } from "react";
import { Rail } from "./rail";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* The rail reads the pathname; under cacheComponents that read must stream in. */}
      <Suspense fallback={<div className="hidden md:block md:w-56" aria-hidden />}>
        <Rail />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
