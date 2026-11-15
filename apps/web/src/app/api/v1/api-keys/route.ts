import { createApiKey, listApiKeys } from "@/lib/api-keys";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const keys = await listApiKeys(actor);
  return json({ apiKeys: keys });
});

/** Create a key. The key is returned once and stored only as a hash. */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "approve");
  const body = (await req.json().catch(() => ({}))) as { name?: string; scopes?: string[]; expiresOn?: string | null };
  return json({ apiKey: await createApiKey(actor, body) }, { status: 201 });
});
