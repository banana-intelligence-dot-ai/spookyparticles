import { finishConnect } from "@/lib/connect";
import { requireEnv } from "@/lib/env";
import { identityFromGoogleIdToken } from "@/lib/identity";
import { GMAIL_SCOPE, exchangeGoogleCode, gmailProfile } from "@/lib/providers/google";

export const GET = (req: Request) =>
  finishConnect(req, "gmail", async (code, redirectUri, verifier) => {
    const tokens = await exchangeGoogleCode(code, redirectUri, verifier);
    const granted = tokens.scope.split(" ");
    if (!granted.includes(GMAIL_SCOPE)) {
      // The user unticked the Gmail box on the consent screen.
      throw new Error("gmail.readonly not granted");
    }
    const profile = await gmailProfile(tokens.access_token);
    return {
      externalAccountId: profile.emailAddress.toLowerCase(),
      display: profile.emailAddress,
      scopes: granted,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresInSeconds: tokens.expires_in,
      // Proof of control of this Google account: it becomes a way to sign in to this same account.
      identity: identityFromGoogleIdToken(tokens.id_token, requireEnv("GOOGLE_CLIENT_ID")),
    };
  });
