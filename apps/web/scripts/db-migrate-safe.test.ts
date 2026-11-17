import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSql, checkStatement, pendingTags, splitStatements } from "./db-migrate-safe";

const ADD_ONLY = `CREATE TYPE "public"."forum_kind" AS ENUM('tip', 'feedback');--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text DEFAULT 'drop; delete' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_channels" ADD COLUMN "muted" boolean DEFAULT false NOT NULL;ALTER TYPE "public"."forum_kind" ADD VALUE 'question';
CREATE UNIQUE INDEX IF NOT EXISTS "forum_posts_idx" ON "forum_posts" USING btree ("id");`;

const DESTRUCTIVE = `ALTER TABLE "alert_channels" ADD COLUMN "muted" boolean;--> statement-breakpoint
ALTER TABLE "alert_channels" DROP COLUMN "target";`;

describe("db:migrate:safe", () => {
  it("passes an add-only migration, with risky words inside strings and names", () => {
    expect(splitStatements(ADD_ONLY)).toHaveLength(6);
    expect(checkSql(ADD_ONLY)).toEqual([]);
  });

  it("refuses a migration with one destructive statement", () => {
    const problems = checkSql(DESTRUCTIVE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/DROP/);
  });

  it.each([
    'DROP TABLE "x"',
    'TRUNCATE "audit_log"',
    'DELETE FROM "session"',
    'UPDATE "user" SET "name" = 1',
    'ALTER TABLE "x" RENAME COLUMN "a" TO "b"',
    'ALTER TABLE "x" ALTER COLUMN "a" SET DATA TYPE integer',
    'ALTER TABLE "x" ALTER COLUMN "a" SET NOT NULL',
    'ALTER TABLE "x" ADD COLUMN "a" int, DROP COLUMN "b"',
    'ALTER TABLE "x" ADD COLUMN "a" int, ALTER COLUMN "b" TYPE text',
    'INSERT INTO "x" VALUES (1)',
    "CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql",
    'CREATE TRIGGER t BEFORE UPDATE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION f()',
    "DO $$ BEGIN DELETE FROM x; END $$",
    'GRANT SELECT ON "x" TO someone',
    'CREATE TABLE "x" AS SELECT * FROM "y"; DROP TABLE "y"',
    'ALTER TABLE "x" DISABLE TRIGGER ALL',
    "VACUUM",
    // Codex review, 2026-11-16
    "CREATE TABLE purge_result AS SELECT lo_unlink(loid) FROM documents",
    "ALTER TABLE accounts ADD COLUMN marker integer, ALTER balance TYPE bigint",
    "ALTER TABLE accounts ADD COLUMN marker integer, ALTER email SET NOT NULL",
    "ALTER TABLE accounts ADD COLUMN marker integer, ALTER status SET DEFAULT 0",
    "ALTER TABLE accounts ADD COLUMN marker integer, ALTER CONSTRAINT accounts_fk DEFERRABLE INITIALLY DEFERRED",
    "ALTER TABLE accounts ADD COLUMN marker integer, FORCE ROW LEVEL SECURITY",
    "ALTER TABLE child_accounts ADD COLUMN marker integer, NO INHERIT accounts",
    "ALTER TABLE accounts ADD COLUMN marker integer, REPLICA IDENTITY NOTHING",
    "ALTER TABLE accounts ADD COLUMN marker integer, SET UNLOGGED",
    "ALTER TABLE documents ADD COLUMN gone integer DEFAULT lo_unlink(1)",
    'ALTER TABLE documents ADD COLUMN gone integer DEFAULT "lo_unlink"(1)',
    "ALTER TABLE documents ADD CONSTRAINT c CHECK (lo_unlink(loid) > 0)",
    'CREATE TABLE "p2" PARTITION OF "events" FOR VALUES IN (1)',
    "CREATE TABLE harmless(a text DEFAULT E'foo\\''); DELETE FROM victims; SELECT 'x'",
    "ALTER TABLE x ADD CONSTRAINT c UNIQUE USING INDEX existing_idx",
    "CREATE SEQUENCE s OWNED BY existing_table.existing_col",
    "COMMENT ON TABLE x IS NULL",
    `CREATE TABLE "x" ("a" text DEFAULT $$it's$$, "b" text DEFAULT 'y'); DROP TABLE "z"`,
    `ALTER TABLE "it's" ADD COLUMN "a" int DEFAULT lo_unlink(1)`,
  ])("refuses %s", (stmt) => {
    expect(checkSql(stmt).length).toBeGreaterThan(0);
  });

  it("does not read a column named updated_at as UPDATE", () => {
    expect(checkStatement("ALTER TABLE x ADD COLUMN updated_at timestamp")).toBeNull();
  });

  it("allows the usual shapes: a default of now(), numeric(10,2), a check with IN, a lower() index", () => {
    for (const stmt of [
      'ALTER TABLE "x" ADD COLUMN "at" timestamp with time zone DEFAULT now() NOT NULL',
      'ALTER TABLE "x" ADD COLUMN "amt" numeric(10, 2)',
      `ALTER TABLE "x" ADD CONSTRAINT "c" CHECK ("o" IS NULL OR "o" IN ('pr_opened', 'told_person'))`,
      'CREATE INDEX "i" ON "user" USING btree (lower("email"))',
      'ALTER TABLE "x" ADD CONSTRAINT "f" FOREIGN KEY ("a", "b") REFERENCES "public"."y"("a", "b") ON DELETE cascade ON UPDATE no action',
    ])
      expect(checkStatement(stmt)).toBeNull();
  });

  it("finds pending migrations the way drizzle does", () => {
    const j = { entries: [{ tag: "0001_a", when: 10 }, { tag: "0002_b", when: 20 }, { tag: "0003_c", when: 30 }] };
    expect(pendingTags(j, 20)).toEqual(["0003_c"]);
    expect(pendingTags(j, null)).toEqual(["0001_a", "0002_b", "0003_c"]);
    expect(pendingTags(j, 30)).toEqual([]);
  });

  it("flags the past migrations that changed behaviour (audit log triggers), and only those kinds", () => {
    const dir = join(__dirname, "../drizzle");
    const flagged = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => checkSql(readFileSync(join(dir, f), "utf8")).length > 0);
    expect(flagged).toContain("0001_audit_log_append_only.sql");
    for (const f of flagged) {
      const sql = readFileSync(join(dir, f), "utf8");
      expect(sql).toMatch(/\b(DROP|DELETE|UPDATE|RENAME|FUNCTION|TRIGGER|ALTER COLUMN|SET DATA TYPE|DO \$\$)\b/i);
    }
  });
});
