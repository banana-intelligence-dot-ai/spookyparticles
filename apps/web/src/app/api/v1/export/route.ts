import { buildExport } from "@/lib/export";
import { api, json } from "@/lib/http";
import { requireActor } from "@/lib/require-actor";

/** Everything we hold about the caller, as JSON. Token ciphertext is never included. */
export const POST = api(async (req) => {
  const actor = await requireActor(req, "read");
  return json(await buildExport(actor), { headers: { "content-disposition": `attachment; filename="spooky-particles-export.json"` } });
});
