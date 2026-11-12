import { ApiError, api, json } from "@/lib/http";
import { handleJsonRpc } from "@/lib/mcp/protocol";
import { toolsFor } from "@/lib/mcp/tools";
import { requireActor } from "@/lib/require-actor";

export const GET = () => new Response(null, { status: 405, headers: { Allow: "POST", "cache-control": "no-store" } });

export const POST = api(async (req) => {
  // A cookie must never authenticate the MCP route. requireActor shares the REST key path.
  if (!/^Bearer\s+\S+$/i.test(req.headers.get("authorization")?.trim() ?? "")) {
    return json({ error: "A Bearer agent key is required" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  let actor;
  try {
    actor = await requireActor(req, "read");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return json({ error: "Invalid Bearer agent key" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    }
    throw err;
  }
  const response = await handleJsonRpc(await req.text(), toolsFor(actor));
  if (response === null || (Array.isArray(response) && response.length === 0)) {
    return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  }
  return json(response);
});
