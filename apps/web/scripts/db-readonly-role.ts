/**
 * Creates or refreshes the read-only database login agents use to check a change on real data.
 * Nate, 2026-11-16: agents may read real data, with no access to secrets, and never write.
 *
 * What it does, every run (safe to repeat; run it again after every migration):
 *   - creates the role spooky_agent_ro if missing, with a new random password,
 *     read-only by default and a 15 second statement limit;
 *   - takes back every table grant, then grants SELECT column by column, leaving out
 *     whole tables and columns that hold secrets or private mail and card data;
 *   - saves the login's connection string in the Mac keychain as "spooky-db-readonly-url"
 *     (only when the password is new). It is never printed and never put on a command line.
 *   - checks itself: the login can read, cannot read a secret column, and cannot write.
 *
 * Run from apps/web:  node --env-file-if-exists=.env.local --import tsx scripts/db-readonly-role.ts [--rotate]
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const ROLE = "spooky_agent_ro";
const KEYCHAIN = "spooky-db-readonly-url";

// Whole tables an agent never reads: sign-in sessions and codes, private mail, card details.
const DENY_TABLES = new Set(["session", "verification", "messages", "receipts"]);
// Named secret columns. The pattern below also catches new ones nobody listed.
const DENY_COLUMNS = new Set([
  "account.access_token", "account.refresh_token", "account.id_token", "account.password",
  "connections.encrypted_access_token", "connections.encrypted_refresh_token", "connections.key_id",
  "checkin_jobs.token", "checkin_jobs.probe",
  "alert_channels.encrypted_target",
  "api_keys.hashed_key",
]);
const SECRETISH = /token|secret|password|encrypted|hashed|api_key|private_key/i;

export function readable(table: string, column: string): boolean {
  if (DENY_TABLES.has(table)) return false;
  if (DENY_COLUMNS.has(`${table}.${column}`)) return false;
  return !SECRETISH.test(column);
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function keychainHas(): boolean {
  try {
    execFileSync("security", ["find-generic-password", "-s", KEYCHAIN], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Writes the secret through `security -i` on stdin, so it never appears in a process list. */
function keychainSave(value: string) {
  execFileSync("security", ["-i"], {
    input: `add-generic-password -U -a spooky -s ${KEYCHAIN} -w "${value}"\n`,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

async function main() {
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) throw new Error("DATABASE_URL is not set (apps/web/.env.local)");
  const sql = neon(ownerUrl);
  const run = (q: string) => sql.query(q);

  const exists = (await sql.query("select 1 from pg_roles where rolname = $1", [ROLE])).length > 0;
  const rotate = process.argv.includes("--rotate") || !exists || !keychainHas();
  // Hex only, so it is safe inside a quoted SQL literal and a URL.
  const password = rotate ? randomBytes(24).toString("hex") : null;

  if (!exists) await run(`create role ${ROLE} login password '${password}'`);
  else if (password) await run(`alter role ${ROLE} with login password '${password}'`);
  await run(`alter role ${ROLE} set default_transaction_read_only = on`);
  await run(`alter role ${ROLE} set statement_timeout = '15s'`);
  await run(`alter role ${ROLE} nosuperuser nocreatedb nocreaterole noreplication`);

  // Start from nothing, then grant only what is readable.
  await run(`revoke all on all tables in schema public from ${ROLE}`);
  await run(`grant usage on schema public to ${ROLE}`);
  const cols = (await sql.query(
    `select table_name, column_name from information_schema.columns
       where table_schema = 'public' order by table_name, ordinal_position`,
  )) as { table_name: string; column_name: string }[];
  const byTable = new Map<string, string[]>();
  for (const c of cols) {
    if (!readable(c.table_name, c.column_name)) continue;
    byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);
  }
  for (const [table, list] of byTable) {
    await run(`grant select (${list.map(quote).join(", ")}) on ${quote(table)} to ${ROLE}`);
  }
  // Which migrations have run, so an agent can check that too.
  const drizzle = await sql.query("select 1 from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'");
  if (drizzle.length) {
    await run(`grant usage on schema drizzle to ${ROLE}`);
    await run(`grant select on drizzle.__drizzle_migrations to ${ROLE}`);
  }

  if (password) {
    const u = new URL(ownerUrl);
    u.username = ROLE;
    u.password = password;
    keychainSave(u.toString());
  }

  // Self-check as the new login.
  const roUrl = execFileSync("security", ["find-generic-password", "-s", KEYCHAIN, "-w"], { encoding: "utf8" }).trim();
  const ro = neon(roUrl);
  const users = (await ro.query('select count(*)::int as n from "user"')) as { n: number }[];
  const refused = async (q: string) => {
    try {
      await ro.query(q);
      return false;
    } catch {
      return true;
    }
  };
  const noSecret = await refused("select token from checkin_jobs limit 1");
  const noSession = await refused("select id from session limit 1");
  const noWrite = await refused(`update "user" set name = name where false`);
  const denied = cols.length - [...byTable.values()].reduce((n, l) => n + l.length, 0);
  console.log(JSON.stringify({
    role: ROLE,
    passwordRotated: Boolean(password),
    tablesReadable: byTable.size,
    columnsHidden: denied,
    canRead: users[0]?.n !== undefined,
    secretColumnRefused: noSecret,
    sessionTableRefused: noSession,
    writeRefused: noWrite,
  }));
  if (!noSecret || !noSession || !noWrite) process.exit(1);
}

if (process.argv[1]?.endsWith("db-readonly-role.ts")) {
  main().catch((e) => {
    // The message only; never the connection string.
    console.error("db-readonly-role failed:", String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
    process.exit(1);
  });
}
