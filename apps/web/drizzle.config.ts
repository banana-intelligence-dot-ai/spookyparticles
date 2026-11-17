import { defineConfig } from "drizzle-kit";

// Only migration reads apps/web/.env.local. Schema generation stays offline
// and does not read local credentials.
if (process.argv.some((arg) => arg === "migrate")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local (CI, fresh clone): migrate will say so.
  }
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
