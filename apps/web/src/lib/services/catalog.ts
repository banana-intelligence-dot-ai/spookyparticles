/** Service clues in Vercel environment variable names. No values enter this table. */
export const SERVICE_CATALOG = [
  { key: "stripe", name: "Stripe", category: "payments", names: [/^STRIPE_/] },
  { key: "resend", name: "Resend", category: "email", names: [/^RESEND_/] },
  { key: "supabase", name: "Supabase", category: "database", names: [/^SUPABASE_/] },
  { key: "neon", name: "Neon", category: "database", names: [/^NEON_/] },
  { key: "postgresql", name: "PostgreSQL", category: "database", names: [/^POSTGRES(?:QL)?_/] },
  { key: "database", name: "Database", category: "database", names: [/^DATABASE_URL$/] },
  { key: "upstash", name: "Upstash", category: "database", names: [/^UPSTASH_/] },
  { key: "kv", name: "KV store", category: "database", names: [/^KV_/] },
  { key: "vercel-blob", name: "Vercel Blob", category: "storage", names: [/^BLOB_READ_WRITE_TOKEN$/] },
  { key: "clerk", name: "Clerk", category: "auth", names: [/^CLERK_/] },
  { key: "auth0", name: "Auth0", category: "auth", names: [/^AUTH0_/] },
  { key: "sentry", name: "Sentry", category: "monitoring", names: [/^SENTRY_/] },
  { key: "posthog", name: "PostHog", category: "analytics", names: [/^POSTHOG_/] },
  { key: "openai", name: "OpenAI", category: "ai", names: [/^OPENAI_/] },
  { key: "anthropic", name: "Anthropic", category: "ai", names: [/^ANTHROPIC_/] },
  { key: "ai-gateway", name: "AI Gateway", category: "ai", names: [/^AI_GATEWAY_/] },
  { key: "twilio", name: "Twilio", category: "messaging", names: [/^TWILIO_/] },
  { key: "sendgrid", name: "SendGrid", category: "email", names: [/^SENDGRID_/] },
  { key: "mailgun", name: "Mailgun", category: "email", names: [/^MAILGUN_/] },
  { key: "pusher", name: "Pusher", category: "realtime", names: [/^PUSHER_/] },
  { key: "algolia", name: "Algolia", category: "search", names: [/^ALGOLIA_/] },
  { key: "cloudinary", name: "Cloudinary", category: "media", names: [/^CLOUDINARY_/] },
  { key: "mapbox", name: "Mapbox", category: "maps", names: [/^MAPBOX_/] },
  { key: "google", name: "Google", category: "api", names: [/^GOOGLE_/] },
  { key: "github", name: "GitHub", category: "api", names: [/^GITHUB_/] },
] as const;

const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "PUBLIC_", "VITE_", "NUXT_PUBLIC_", "EXPO_PUBLIC_", "GATSBY_", "REACT_APP_"];

export function serviceForName(value: string) {
  return SERVICE_CATALOG.find((s) => s.name.toLowerCase() === value.trim().toLowerCase() || s.key === value.trim().toLowerCase());
}

export function detectServices(names: readonly string[]): string[] {
  const found = new Set<string>();
  for (const raw of names) {
    let name = raw.toUpperCase();
    const publicPrefix = PUBLIC_PREFIXES.find((p) => name.startsWith(p));
    if (publicPrefix) name = name.slice(publicPrefix.length);
    // A vendor prefix is evidence. Generic credentials and names with a vendor only in the middle are not.
    const service = SERVICE_CATALOG.find((s) => s.names.some((pattern) => pattern.test(name)));
    if (service) found.add(service.key);
  }
  // One database often sets several names (a Neon or Supabase install also sets POSTGRES_* and DATABASE_URL).
  // When the vendor is known, the generic rows are the same thing and are dropped.
  if (found.has("neon") || found.has("supabase")) { found.delete("postgresql"); found.delete("database"); }
  if (found.has("postgresql")) found.delete("database");
  return [...found].sort();
}
