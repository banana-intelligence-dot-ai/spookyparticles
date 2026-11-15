import { Suspense } from "react";
import { SettingsView } from "./settings-view";
import { vercelIntegrationConfig, vercelSignInConfig } from "@/lib/env";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="max-w-5xl">
      <Suspense fallback={<p className="text-[14px] text-fg-3">Loading…</p>}>
        <SettingsView integrationEnabled={Boolean(vercelIntegrationConfig())} vercelSignInEnabled={Boolean(vercelSignInConfig())} />
      </Suspense>
    </div>
  );
}
