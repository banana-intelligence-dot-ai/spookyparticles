/**
 * Add-only migrations, enforced (Nate, 2026-11-16: agents run migrations that only add).
 * Reads every pending migration, refuses the whole run if any statement is not plainly
 * add-only, then runs drizzle-kit migrate and appends a line to docs/migrations-log.md.
 *
 * Allowed: CREATE TABLE, CREATE [UNIQUE] INDEX, CREATE TYPE ... AS ENUM, CREATE SCHEMA,
 * CREATE SEQUENCE, ALTER TABLE ... ADD COLUMN / ADD CONSTRAINT, ALTER TYPE ... ADD VALUE,
 * and nothing else. Everything else, including anything not recognised (functions, triggers,
 * DO blocks), waits for Nate and runs through the raw `npm run db:migrate`.
 *
 * From apps/web:  npm run db:migrate:safe
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Split SQL into statements on top-level semicolons, dropping comments; quotes and $$ bodies stay whole. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      cur += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c && sql[j + 1] === c) j += 2;
        else if (sql[j] === c) break;
        else j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      const stop = end === -1 ? sql.length : end + dollar[0].length;
      cur += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ALLOWED = [
  /^CREATE TABLE /,
  /^CREATE (UNIQUE )?INDEX /,
  /^CREATE TYPE \S+ AS ENUM ?\(/,
  /^CREATE SCHEMA /,
  /^CREATE SEQUENCE /,
  /^ALTER TABLE (ONLY )?(IF EXISTS )?\S+ ADD (COLUMN|CONSTRAINT) /,
  /^ALTER TYPE \S+ ADD VALUE /,
];

/** Words that change or remove what is already there, or read or run anything, anywhere in the statement. */
const FORBIDDEN =
  /\b(DROP|TRUNCATE|DELETE|UPDATE|RENAME|INSERT|MERGE|COPY|GRANT|REVOKE|ALTER COLUMN|SET DATA TYPE|OWNER TO|SET SCHEMA|ENABLE|DISABLE|REPLACE|FUNCTION|TRIGGER|RULE|POLICY|DO|EXECUTE|CALL|SELECT|VALUES|PARTITION|INHERIT|INHERITS|SECURITY|UNLOGGED|REPLICA|USING INDEX|OWNED|COMMENT)\b/;

/**
 * Names allowed right before "(" in statements that touch existing rows (ALTER TABLE, CREATE INDEX).
 * A default or CHECK on a new column runs once per existing row, so any other call is refused.
 */
const SAFE_CALLS = new Set([
  "KEY", "UNIQUE", "CHECK", "IN", "ANY", "ENUM", "INCLUDE", "WITH", "REFERENCES", "ON",
  "NUMERIC", "DECIMAL", "VARCHAR", "CHAR", "VARYING", "TIMESTAMP", "TIME", "INTERVAL", "BIT",
  "NOW", "GEN_RANDOM_UUID", "LOWER", "UPPER", "COALESCE",
]);

/** Top-level commas: ALTER TABLE ... ADD COLUMN a int, ALTER b TYPE ... would hide a second action. */
function hasTopLevelComma(s: string): boolean {
  let depth = 0;
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) return true;
  }
  return false;
}

/** Returns null when the statement only adds, otherwise why it was refused. */
export function checkStatement(stmt: string): string | null {
  const norm = stmt
    // One left-to-right pass, so a quote inside a name or a $$ body cannot hide words.
    .replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (m) =>
      m[0] === "'" ? "''" : m[0] === '"' ? "X" : " $$BODY$$ ",
    )
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!ALLOWED.some((re) => re.test(norm))) return `not an add-only statement: ${norm.slice(0, 80)}`;
  // Foreign key actions are about future deletes of the parent row, not this migration.
  const body = norm.replace(/\bON (DELETE|UPDATE) (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT)\b/g, "");
  const bad = FORBIDDEN.exec(body);
  if (bad) return `contains ${bad[1]}: ${norm.slice(0, 80)}`;
  // A new table has no rows, so its defaults and checks run on nothing yet. Everything else
  // touches existing rows: one action per statement, and no calls outside SAFE_CALLS.
  if (/^CREATE (TABLE|TYPE|SCHEMA|SEQUENCE) /.test(norm)) return null;
  if (/^ALTER /.test(norm) && hasTopLevelComma(body)) return `more than one action: ${norm.slice(0, 80)}`;
  const calls = body
    .replace(/\bREFERENCES X(\.X)? ?\(/g, "REFERENCES (") // REFERENCES "public"."user"("id")
    .replace(/\bON (ONLY )?X(\.X)?( USING \w+)? ?\(/g, "ON (") // CREATE INDEX ... ON "t" USING btree ("c")
    .matchAll(/([A-Z_][A-Z0-9_]*|X) ?\(/g);
  for (const m of calls) if (!SAFE_CALLS.has(m[1])) return `calls ${m[1]}(: ${norm.slice(0, 80)}`;
  return null;
}

export function checkSql(sql: string): string[] {
  // E'it\'s' strings escape quotes with a backslash, which would throw off the split. None of our
  // migrations need one, so any backslash sends the file to Nate.
  if (sql.includes("\\")) return ["contains a backslash, so it cannot be checked safely"];
  return splitStatements(sql)
    .map(checkStatement)
    .filter((r): r is string => r !== null);
}

type Journal = { entries: { tag: string; when: number }[] };

/** Same rule drizzle's migrator uses: a migration is pending when it is newer than the last one applied. */
export function pendingTags(journal: Journal, lastAppliedAt: number | null): string[] {
  return journal.entries.filter((e) => lastAppliedAt === null || e.when > lastAppliedAt).map((e) => e.tag);
}

export function logRow(date: string, tags: string[], session: string, result: string): string {
  return `| ${date} | ${tags.join(", ")} | agent, db:migrate:safe | ${session} | ${result} |\n`;
}

const APP = join(__dirname, "..");
const LOG = join(APP, "../../docs/migrations-log.md");

async function main() {
  try {
    process.loadEnvFile(join(APP, ".env.local"));
  } catch {
    // CI or a fresh clone: DATABASE_URL may come from the environment.
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (apps/web/.env.local).");
    process.exit(1);
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  // The same query and comparison drizzle's migrator uses, so "pending" means the same thing.
  let last: number | null = null;
  try {
    const rows = (await sql.query(
      'select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1',
    )) as { created_at: string | null }[];
    last = rows.length ? Number(rows[0].created_at) : null;
  } catch (e) {
    if (!/does not exist/.test(String((e as Error)?.message))) throw e;
  }
  const journal = JSON.parse(readFileSync(join(APP, "drizzle/meta/_journal.json"), "utf8")) as Journal;
  const tags = pendingTags(journal, last);
  if (!tags.length) {
    console.log("Nothing to apply.");
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const session = process.env.CLAUDE_CODE_SESSION_ID ?? "no session id";
  const problems = tags.flatMap((t) => checkSql(readFileSync(join(APP, "drizzle", `${t}.sql`), "utf8")).map((p) => `${t}: ${p}`));
  if (problems.length) {
    appendFileSync(LOG, logRow(date, tags, session, `refused, waits for Nate (${problems.length} statement${problems.length > 1 ? "s" : ""})`));
    console.error(`Refused. These are not add-only, so they wait for Nate:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`Add-only, applying: ${tags.join(", ")}`);
  const run = spawnSync("npx", ["drizzle-kit", "migrate"], { cwd: APP, stdio: "inherit" });
  const ok = run.status === 0;
  appendFileSync(LOG, logRow(date, tags, session, ok ? "applied" : `failed (exit ${run.status})`));
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith("db-migrate-safe.ts")) {
  main().catch((e) => {
    console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
    process.exit(1);
  });
}
