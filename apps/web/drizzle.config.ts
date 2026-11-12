import { defineConfig } from "drizzle-kit";

// Load apps/web/.env.local when present so `db:migrate` sees DATABASE_URL
// without extra flags. Next.js loads the same file for the app itself.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI, fresh clone): generate still works, migrate will say so.
}

// `npm run db:generate` only reads the schema and writes SQL; it never connects.
// Applying migrations (`npm run db:migrate`) needs DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://placeholder" },
  strict: true,
  verbose: true,
});
