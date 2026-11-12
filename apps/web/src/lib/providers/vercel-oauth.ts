/** Vercel integration code exchange with our client secret, not a customer token. */
export type VercelInstallToken = {
  token_type: string;
  access_token: string;
  installation_id: string;
  user_id: string;
  team_id: string | null;
};

export function buildVercelExchangeRequest(input: {
  clientId: string; clientSecret: string; code: string; redirectUri: string;
}) {
  return {
    url: "https://api.vercel.com/v2/oauth/access_token",
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }).toString(),
      cache: "no-store" as const,
    },
  };
}

export function parseVercelExchangeResponse(value: unknown): VercelInstallToken {
  if (!value || typeof value !== "object") throw new Error("invalid Vercel exchange response");
  const v = value as Record<string, unknown>;
  for (const key of ["token_type", "access_token", "installation_id", "user_id"]) {
    if (typeof v[key] !== "string" || !v[key]) throw new Error("invalid Vercel exchange response");
  }
  if (v.team_id !== undefined && v.team_id !== null && typeof v.team_id !== "string") {
    throw new Error("invalid Vercel exchange response");
  }
  if (String(v.token_type).toLowerCase() !== "bearer") throw new Error("unsupported Vercel token type");
  return {
    token_type: v.token_type as string,
    access_token: v.access_token as string,
    installation_id: v.installation_id as string,
    user_id: v.user_id as string,
    team_id: (v.team_id as string | null | undefined) ?? null,
  };
}

export async function exchangeVercelCode(input: Parameters<typeof buildVercelExchangeRequest>[0]) {
  const { url, init } = buildVercelExchangeRequest(input);
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Vercel exchange failed: ${response.status}`);
  return parseVercelExchangeResponse(await response.json());
}
