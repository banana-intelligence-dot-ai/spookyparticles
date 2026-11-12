"use client";
import { VercelConnect } from "../../app/connections/vercel-connect";

export function VercelConnectPreview() {
  return <VercelConnect onConnected={() => undefined} onClose={() => undefined} />;
}
