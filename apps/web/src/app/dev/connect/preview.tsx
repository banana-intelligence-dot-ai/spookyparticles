"use client";
import { VercelConnect } from "../../app/settings/vercel-connect";

export function VercelConnectPreview() {
  return <VercelConnect onConnected={() => undefined} onClose={() => undefined} />;
}
