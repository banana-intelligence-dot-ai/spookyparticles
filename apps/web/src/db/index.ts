import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | undefined;

/**
 * Lazy connection. Nothing connects at import time, so `next build` works with
 * placeholder env values and no database.
 */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  db = drizzle({ client: neon(url), schema });
  return db;
}

export { schema };
