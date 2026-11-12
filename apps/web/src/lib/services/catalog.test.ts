import { expect, it } from "vitest";
import { detectServices, serviceForName } from "./catalog";

it("detects known services from names only, including public names", () => {
  expect(detectServices(["STRIPE_SECRET_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "RESEND_API_KEY", "STRIPE_WEBHOOK_SECRET"]))
    .toEqual(["posthog", "resend", "stripe"]);
  expect(detectServices(["NEON_DATABASE_URL", "POSTGRES_URL", "DATABASE_URL", "KV_REST_API_URL", "BLOB_READ_WRITE_TOKEN"]))
    .toEqual(["kv", "neon", "vercel-blob"]);
});

it("covers the service families and ignores generic secrets", () => {
  const names = ["SUPABASE_URL", "CLERK_SECRET_KEY", "AUTH0_DOMAIN", "SENTRY_DSN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_GATEWAY_API_KEY", "TWILIO_SID", "SENDGRID_API_KEY", "MAILGUN_DOMAIN", "PUSHER_APP_ID", "ALGOLIA_APP_ID", "CLOUDINARY_URL", "MAPBOX_TOKEN", "GOOGLE_CLIENT_ID", "GITHUB_TOKEN"];
  expect(detectServices(names)).toHaveLength(16);
  expect(detectServices(["DATABASE_URL", "API_KEY", "CRON_SECRET", "MY_STRIPE_SECRET"])).toEqual(["database"]);
  expect(serviceForName("Stripe")?.key).toBe("stripe");
});

it("names one database once when the vendor is known", () => {
  expect(detectServices(["DATABASE_URL", "POSTGRES_URL", "NEON_PROJECT_ID"])).toEqual(["neon"]);
  expect(detectServices(["DATABASE_URL", "POSTGRES_PRISMA_URL"])).toEqual(["postgresql"]);
  expect(detectServices(["DATABASE_URL"])).toEqual(["database"]);
});
