/**
 * Run one read-only query against real data as the agent login (spooky_agent_ro), to confirm a
 * change worked. The login cannot write and cannot see secrets. Prints rows as JSON.
 * Never copy users' personal data out of the database: count, check, and move on.
 *
 * From apps/web:  npm run db:ro -- 'select count(*) from checkin_jobs'
 */
import { execFileSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error("Usage: npm run db:ro -- '<select ...>'");
  process.exit(2);
}
let url: string;
try {
  url = execFileSync("security", ["find-generic-password", "-s", "spooky-db-readonly-url", "-w"], { encoding: "utf8" }).trim();
} catch {
  console.error("No read-only login in the keychain. Create it: node --env-file-if-exists=.env.local --import tsx scripts/db-readonly-role.ts");
  process.exit(1);
}
neon(url)
  .query(query)
  .then((rows) => console.log(JSON.stringify(rows, null, 1)))
  .catch((e) => {
    console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
    process.exit(1);
  });
