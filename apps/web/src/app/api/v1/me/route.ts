import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api, ApiError, json } from "@/lib/http";
import { listSignInIdentities } from "@/lib/identity";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const [u] = await getDb()
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, image: schema.user.image, createdAt: schema.user.createdAt })
    .from(schema.user)
    .where(eq(schema.user.id, actor.userId))
    .limit(1);
  if (!u) throw new ApiError(404, "not_found", "User not found");
  // Every provider identity that signs in to this account: the sign-in account plus
  // every connected Google inbox and linked GitHub account.
  const identities = await listSignInIdentities(actor.userId);
  return json({
    user: u,
    auth: { via: actor.via, scopes: actor.scopes },
    signInIdentities: identities.map((i) => ({ provider: i.providerId, accountId: i.accountId, label: i.label, since: i.createdAt })),
  });
});
