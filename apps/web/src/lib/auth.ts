/**
 * Sign-in only. Better Auth with Vercel, GitHub and Google, minimal scopes (email and
 * profile). Mailbox and provider access never comes from here: those are
 * connections with their own consent flows (src/app/api/connect).
 *
 * GitHub sign-in uses the GitHub App's own OAuth credentials. GitHub Apps ignore
 * OAuth scopes; the user token can do only what the app's permissions allow, and
 * we use it for one thing beyond sign-in: listing the user's installations of
 * our app (src/lib/github-connect.ts). The app needs the account permission
 * "Email addresses: read" so private emails resolve at sign-in.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "@/db";
import { track } from "./analytics/server";
import { appUrl, vercelSignInConfig } from "./env";

function createAuth() {
  const vercelConfig = vercelSignInConfig();
  return betterAuth({
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      // neon-http has no interactive transactions.
      transaction: false,
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    account: {
      // Sign-in tokens are low value (email, profile) but still encrypted at rest.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Vercel may omit email_verified. Trust it for explicit linking, but
        // never link an existing account implicitly during sign-in.
        allowDifferentEmails: true,
        ...(vercelConfig ? { trustedProviders: ["vercel"], disableImplicitLinking: true } : {}),
      },
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
        disableDefaultScope: true,
        scope: ["read:user", "user:email"],
        ...(vercelConfig ? { disableSignUp: true } : {}),
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        disableDefaultScope: true,
        scope: ["openid", "email", "profile"],
        prompt: "select_account",
        ...(vercelConfig ? { disableSignUp: true } : {}),
      },
      ...(vercelConfig ? {
        vercel: {
          ...vercelConfig,
          disableDefaultScope: true,
          scope: ["openid", "email", "profile"],
        },
      } : {}),
    },
    databaseHooks: {
      user: {
        create: {
          // The first server-side funnel step. Provider is unknown here; the click before it carried it.
          after: async (user, context) => {
            const provider = context?.path?.startsWith("/callback/") ? context.path.split("/").pop() ?? null : null;
            await track(user.id, "signed_up", { provider });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;

/** Lazy, so importing this module never touches env or the database. */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
