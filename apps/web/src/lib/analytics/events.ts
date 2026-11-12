/**
 * The event list, and nothing else. Adding an event means
 * adding it here first, so every name in PostHog is one we decided on.
 */
export type AnalyticsEvents = {
  consent_screen_shown: { provider: "gmail" | "github" | "vercel" };
  consent_granted: { provider: "gmail" | "github" | "vercel"; connection_id: string; via?: "integration" };
  consent_abandoned: { provider: "gmail" | "github" | "vercel"; reason: string };
  /** Time from connect to the first result on screen. */
  first_result_shown: { connection_id: string; ms_since_connect: number };
  backfill_complete: { connection_id: string; scanned: number; candidates: number; duration_ms: number };
  /** The reading pipeline finished a pass over one inbox and findings were recomputed. */
  reading_complete: { connection_id: string; receipts: number; skipped: number; failed: number; findings: number; subscriptions: number };
  /** At least one inbox connected and the card rendered. */
  audit_completed: { connections: number };
  card_viewed: { ref?: string };
  card_shared: { ref: string; channel?: string };
  referral_landed: { ref: string };
  finding_wrong_tapped: { finding_kind: string };
  m2_action_requested: { action: string };
  /** A new account: the first server-side funnel step after a click. */
  signed_up: { provider: string | null };
  /** A read-only key for a coding agent was made. */
  agent_key_created: { scopes: string };
  /** An alert email went out (deploy failed, and later kinds). */
  alert_sent: { kind: string };
  moved_to_vercel: { from: string };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

export const ANALYTICS_EVENT_NAMES = [
  "consent_screen_shown",
  "consent_granted",
  "consent_abandoned",
  "first_result_shown",
  "backfill_complete",
  "reading_complete",
  "audit_completed",
  "card_viewed",
  "card_shared",
  "referral_landed",
  "finding_wrong_tapped",
  "m2_action_requested",
  "signed_up",
  "agent_key_created",
  "alert_sent",
  "moved_to_vercel",
] as const satisfies readonly AnalyticsEventName[];

export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}
