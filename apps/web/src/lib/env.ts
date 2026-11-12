/** Read a required env var at call time (never at import time, so builds need no secrets). */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function appUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function flag(name: string): boolean {
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").toLowerCase());
}

/** Optional Vercel apps stay absent until all credentials for that app exist. */
export function vercelIntegrationConfig() {
  const slug = process.env.VERCEL_INTEGRATION_SLUG;
  const clientId = process.env.VERCEL_INTEGRATION_CLIENT_ID;
  const clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET;
  return slug && clientId && clientSecret ? { slug, clientId, clientSecret } : null;
}

export function vercelSignInConfig() {
  const clientId = process.env.VERCEL_APP_CLIENT_ID;
  const clientSecret = process.env.VERCEL_APP_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
