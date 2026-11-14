import { Suspense } from "react";
import { ConnectionsView } from "./connections-view";
import { vercelIntegrationConfig, vercelSignInConfig } from "@/lib/env";

export const metadata = { title: "Accounts" };

export default function ConnectionsPage() {
  return (
    <div className="max-w-4xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <ConnectionsView integrationEnabled={Boolean(vercelIntegrationConfig())} vercelSignInEnabled={Boolean(vercelSignInConfig())} />
      </Suspense>
    </div>
  );
}
