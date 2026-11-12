/**
 * Incident script: revoke every active connection at its provider, mark it
 * revoked, wipe the ciphertext, and write an audit row per connection.
 *
 *   npm run revoke:all              dry run: prints what it would do
 *   npm run revoke:all -- --confirm does it
 *
 * Needs DATABASE_URL, SP_MASTER_KEY, the Google OAuth client credentials (Gmail
 * token revoke) and GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY (GitHub connections
 * are uninstalled with DELETE /app/installations/{id}).
 * Never prints token values.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { revokeConnection } from "../src/lib/connections";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const db = getDb();
  const active = await db.select().from(schema.connections).where(eq(schema.connections.status, "active"));

  const byProvider = new Map<string, number>();
  for (const c of active) byProvider.set(c.provider, (byProvider.get(c.provider) ?? 0) + 1);
  console.log(`Active connections: ${active.length}`);
  for (const [p, n] of byProvider) console.log(`  ${p}: ${n}`);

  if (!confirm) {
    console.log("\nDry run. Nothing was revoked. Re-run with --confirm to revoke all of the above.");
    return;
  }

  let revoked = 0;
  let providerUnconfirmed = 0;
  for (const c of active) {
    const r = await revokeConnection(c, "system:mass-revoke");
    revoked += 1;
    if (!r.providerRevoked) {
      providerUnconfirmed += 1;
      console.log(`  provider did not confirm: ${c.provider} connection ${c.id} (status ${r.providerStatus ?? "n/a"})`);
    }
  }
  console.log(`\nRevoked ${revoked} of ${active.length} connections.`);
  if (providerUnconfirmed) {
    console.log(`${providerUnconfirmed} were not confirmed by the provider; our copies are wiped, but follow up in the provider console.`);
  }
}

main().catch((err) => {
  console.error("mass-revoke failed:", (err as Error).message);
  process.exit(1);
});
