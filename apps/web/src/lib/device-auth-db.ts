/** Agent sign-in wired to the real database, session store, audit log and analytics. */
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, gte, like, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { API_KEY_PREFIX } from "./actor";
import { appendAudit } from "./audit";
import { track } from "./analytics/server";
import { randomToken, sha256Hex } from "./crypto";
import { createDeviceHandlers, createIpLimiter, START_LIMIT, type DeviceAccess, type DeviceStore } from "./device-auth";
import { appUrl } from "./env";
import { requireActor } from "./require-actor";

const v = schema.verification;
const WRITE_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const store: DeviceStore = {
  async insert(rows) {
    await getDb()
      .insert(v)
      .values(rows.map((r) => ({ id: randomUUID(), ...r })));
  },
  async get(identifier, now) {
    const [row] = await getDb()
      .select({ value: v.value, expiresAt: v.expiresAt })
      .from(v)
      .where(and(eq(v.identifier, identifier), gt(v.expiresAt, now)))
      .orderBy(desc(v.createdAt))
      .limit(1);
    return row ?? null;
  },
  async compareAndSet(identifier, expected, next, now) {
    // One statement, so the database serializes concurrent writers: only one can match `expected`.
    const changed = await getDb()
      .update(v)
      .set({ value: next, updatedAt: now })
      .where(and(eq(v.identifier, identifier), eq(v.value, expected), gt(v.expiresAt, now)))
      .returning({ id: v.id });
    return changed.length === 1;
  },
  async purgeExpired(now) {
    await getDb()
      .delete(v)
      .where(and(or(like(v.identifier, "device:%"), like(v.identifier, "device-user:%")), lt(v.expiresAt, now)));
  },
};

export const deviceHandlers = createDeviceHandlers({
  store,
  origin: appUrl,
  requireActor,
  allowStart: createIpLimiter(START_LIMIT),
  async mintKey(userId, name, access: DeviceAccess) {
    // Same shape as POST /api/v1/api-keys: shown once and stored only as a hash.
    const key = `${API_KEY_PREFIX}${randomToken(32)}`;
    const scopes: ("read" | "write")[] = access === "write" ? ["read", "write"] : ["read"];
    const expiresAt = access === "write" ? new Date(Date.now() + WRITE_KEY_TTL_MS) : null;
    const [row] = await getDb()
      .insert(schema.apiKeys)
      .values({ userId, name, hashedKey: sha256Hex(key), prefix: key.slice(0, 7), scopes, expiresAt })
      .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, expiresAt: schema.apiKeys.expiresAt });
    return { ...row, key };
  },
  async countRecentWriteApprovals(userId, since) {
    const [row] = await getDb()
      .select({ total: count() })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, userId),
          eq(schema.auditLog.action, "device.approved"),
          gte(schema.auditLog.createdAt, since),
          sql`${schema.auditLog.after} @> ${JSON.stringify({ access: "write" })}::jsonb`,
        ),
      );
    return row?.total ?? 0;
  },
  audit: appendAudit,
  async trackStart(client, access) {
    await track("anon:device", "agent_signin_started", { client, access });
  },
  async track(userId, scopes) {
    await track(userId, "agent_key_created", { scopes: scopes.join(","), via: "device" });
  },
});
