/** requireActor() wired to the real session store and database. */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getAuth } from "./auth";
import { createRequireActor } from "./actor";

export const requireActor = createRequireActor({
  async getSessionUserId(headers) {
    const session = await getAuth().api.getSession({ headers });
    return session?.user.id ?? null;
  },
  async findApiKeyByHash(hash) {
    const [row] = await getDb()
      .select({
        id: schema.apiKeys.id,
        userId: schema.apiKeys.userId,
        scopes: schema.apiKeys.scopes,
        revokedAt: schema.apiKeys.revokedAt,
      })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.hashedKey, hash), isNull(schema.apiKeys.revokedAt)))
      .limit(1);
    return row ?? null;
  },
  async touchApiKey(id) {
    await getDb().update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, id));
  },
});
