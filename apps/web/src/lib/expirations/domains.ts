import type { VercelRegistration } from "@/lib/providers/vercel";

/** A refused account read is null: keep the last known registration facts. */
export function registrationAttributes(previous: Record<string, unknown> | undefined, registrations: VercelRegistration[] | null, name: string) {
  if (registrations === null) return {
    expires_at: previous?.expires_at ?? null,
    auto_renew: previous?.auto_renew ?? null,
    registration: previous?.registration ?? null,
  };
  const registration = registrations.find((r) => r.name === name);
  return {
    expires_at: registration?.expiresAt ?? null,
    auto_renew: registration?.autoRenew ?? null,
    registration: registration ? registration.registeredHere ? "vercel" : "elsewhere" : null,
  };
}
