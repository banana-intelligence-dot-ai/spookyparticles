#!/usr/bin/env node
/**
 * Re-run the Tier 0 header classifier over stored candidates and drop the ones
 * it no longer accepts. Run it whenever the sender table, the consumer list or
 * the classifier rules change:  node scripts/rescore-tier0.mjs [--apply]
 *
 * Reads only headers already in the messages table (never bodies), prints
 * counts per inbox and per skip reason, and deletes nothing without --apply.
 * A message the classifier now skips as consumer goes, receipt and all; other
 * skipped messages that already have a receipt are kept.
 */
import { neon } from "@neondatabase/serverless";
import { classifyHeader } from "@spooky/tier0";

process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);
const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);

const inboxes = await sql`select id, display from connections where provider = 'gmail' and status <> 'revoked'`;
let dropTotal = 0;
for (const inbox of inboxes) {
  const rows = await sql`
    select m.id, m."from", m.reply_to, m.subject, m.list_unsubscribe, m.labels, m.attachment_names, m.tier0_reason,
           (r.id is not null) as has_receipt
    from messages m left join receipts r on r.message_id = m.id
    where m.connection_id = ${inbox.id}`;
  const drop = [];
  const reasons = new Map();
  const keepReasons = new Map();
  const updates = [];
  for (const m of rows) {
    const c = classifyHeader({
      from: m.from ?? "",
      replyTo: m.reply_to ?? undefined,
      subject: m.subject ?? "",
      listUnsubscribe: m.list_unsubscribe,
      labels: m.labels ?? [],
      attachmentNames: m.attachment_names ?? [],
      isSent: (m.labels ?? []).includes("SENT"),
    });
    if (!c.candidate && (!m.has_receipt || c.skipReason === "consumer")) {
      drop.push(m.id);
      reasons.set(c.skipReason ?? "no_signal", (reasons.get(c.skipReason ?? "no_signal") ?? 0) + 1);
      continue;
    }
    const reason = c.candidate ? (c.vendor ? `${c.reason}:${c.vendor}` : c.reason) : m.tier0_reason;
    keepReasons.set(reason.split(":")[0], (keepReasons.get(reason.split(":")[0]) ?? 0) + 1);
    if (reason !== m.tier0_reason) updates.push({ id: m.id, reason });
  }
  const masked = inbox.display.replace(/^(.).*(@.*)$/, "$1…$2");
  console.log(`${masked}: ${rows.length} stored, keep ${rows.length - drop.length}, drop ${drop.length}`);
  console.log(`  drop by reason: ${[...reasons].map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
  console.log(`  keep by signal: ${[...keepReasons].map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
  dropTotal += drop.length;
  if (apply) {
    for (let i = 0; i < drop.length; i += 500) {
      const slice = drop.slice(i, i + 500);
      await sql`delete from receipts where message_id = any(${slice}::uuid[])`;
      await sql`delete from messages where id = any(${slice}::uuid[])`;
    }
    for (const u of updates) await sql`update messages set tier0_reason = ${u.reason} where id = ${u.id}`;
    console.log(`  applied: deleted ${drop.length}, relabeled ${updates.length}`);
  }
}
if (!apply) console.log(`\nDry run. ${dropTotal} rows would be deleted. Re-run with --apply.`);
