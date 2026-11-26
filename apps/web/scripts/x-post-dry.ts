/**
 * Dry run of the @spookyparticles posting step: prints exactly what would post today and every
 * check, and sends nothing. History is read with the read-only agent login. It reports whether the
 * four keys are set here, never their values.
 *
 * From apps/web:  npm run x:dry
 */
import { execFileSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { fetchPostedLog, planXPost, QUEUE, X_KEY_NAMES, X_FIRST_POST_DAY, X_POST_HOUR_PT, X_POSTING_DAILY, xPostingOn } from "../src/lib/x-posts/plan";

async function main() {
  const url = execFileSync("security", ["find-generic-password", "-s", "spooky-db-readonly-url", "-w"], { encoding: "utf8" }).trim();
  const rows = (await neon(url).query("select after->>'text' as text from audit_log where action = 'x.posted'")) as { text: string | null }[];
  const posted = rows.map((r) => r.text).filter((t): t is string => typeof t === "string");
  const keysSet = X_KEY_NAMES.filter((n) => (process.env[n] ?? "").trim() !== "");
  // The dry run judges the line as if the switch and keys were on, so every check shows.
  const plan = planXPost({ on: true, keysPresent: true, queue: QUEUE, posted, others: await fetchPostedLog() });
  console.log(`DRY RUN. Nothing is sent.`);
  console.log(`Switch: ${X_POSTING_DAILY ? "ON daily" : `on for ${X_FIRST_POST_DAY} only`}, ${xPostingOn(Date.now()) ? "ON" : "OFF"} today. Posting hour: ${X_POST_HOUR_PT}:00 Pacific. Keys set in this shell: ${keysSet.length} of 4.`);
  console.log(`Queue: ${QUEUE.length} lines, ${posted.length} posted before.`);
  if (plan.action === "post") console.log(`Would post (text only, no link):\n  ${plan.text}`);
  else console.log(`Would post nothing: ${plan.reason}${plan.text ? `\n  Line: ${plan.text}` : ""}`);
  for (const c of plan.checks) console.log(`  [${c.ok ? "pass" : "FAIL"}] ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  if (!xPostingOn(Date.now())) console.log(`Live today: nothing posts, because the switch is off today.`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
  process.exit(1);
});
