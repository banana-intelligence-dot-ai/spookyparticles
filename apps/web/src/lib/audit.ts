/**
 * The audit log is append-only. This module is the only writer and exposes no
 * update or delete. The database enforces the same rule with a trigger
 * (drizzle/0001_audit_log_append_only.sql).
 *
 * Never put token values or env var values in before/after.
 */
import { getDb, schema } from "@/db";

export type AuditEntry = {
  actor: string;
  userId?: string | null;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
};

export async function appendAudit(entry: AuditEntry): Promise<void> {
  await getDb()
    .insert(schema.auditLog)
    .values({
      actor: entry.actor,
      userId: entry.userId ?? null,
      action: entry.action,
      target: entry.target,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
}
