/** Stateless JSON-RPC 2.0 handling, independent of HTTP and the app's data layer. */
export type Tool = {
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  annotations: { readOnlyHint: true } | { readOnlyHint: false; destructiveHint: false; idempotentHint: false; openWorldHint: false };
  validate: (input: Record<string, unknown>) => string | null;
  run: (input: Record<string, unknown>) => Promise<object>;
};

export type ToolRegistry = Record<string, Tool>;
export class ToolError extends Error {}

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const versions = ["2025-06-18", "2025-03-26"];
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function error(id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function result(id: JsonRpcResponse["id"], value: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result: value };
}

async function handleOne(message: unknown, tools: ToolRegistry): Promise<JsonRpcResponse | null> {
  if (!record(message)) return error(null, -32600, "Invalid Request");
  const hasId = own(message, "id");
  const id = message.id;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
      (hasId && id !== null && typeof id !== "string" && typeof id !== "number") ||
      (hasId && typeof id === "number" && !Number.isFinite(id))) {
    return error(null, -32600, "Invalid Request");
  }
  // JSON-RPC notifications have no id, and must never receive a response.
  if (!hasId) return null;
  const responseId = id as JsonRpcResponse["id"];
  switch (message.method) {
    case "initialize": {
      if (!record(message.params) || typeof message.params.protocolVersion !== "string")
        return error(responseId, -32602, "Invalid params");
      return result(responseId, {
        protocolVersion: versions.includes(message.params.protocolVersion) ? message.params.protocolVersion : versions[0],
        capabilities: { tools: {} },
        serverInfo: { name: "spooky-particles", version: "1.0.0" },
      });
    }
    case "ping":
      return result(responseId, {});
    case "tools/list":
      return result(responseId, {
        tools: Object.entries(tools).map(([name, tool]) => ({
          name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations,
        })),
      });
    case "tools/call": {
      if (!record(message.params) || typeof message.params.name !== "string" ||
          (message.params.arguments !== undefined && !record(message.params.arguments)))
        return error(responseId, -32602, "Invalid params");
      if (!own(tools, message.params.name)) return error(responseId, -32602, "Unknown tool");
      const tool = tools[message.params.name];
      const args = (message.params.arguments ?? {}) as Record<string, unknown>;
      const problem = tool.validate(args);
      if (problem) return error(responseId, -32602, problem);
      try {
        const value = await tool.run(args);
        return result(responseId, {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
        });
      } catch (err) {
        return result(responseId, {
          isError: true,
          content: [{ type: "text", text: err instanceof ToolError ? err.message : "Could not reach Spooky Particles data right now." }],
        });
      }
    }
    default:
      return error(responseId, -32601, "Method not found");
  }
}

export async function handleMessage(message: unknown, tools: ToolRegistry): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(message)) {
    if (!message.length) return error(null, -32600, "Invalid Request");
    const responses = await Promise.all(message.map((item) => handleOne(item, tools)));
    return responses.filter((item): item is JsonRpcResponse => item !== null);
  }
  return handleOne(message, tools);
}

export async function handleJsonRpc(body: string, tools: ToolRegistry): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  try {
    return await handleMessage(JSON.parse(body), tools);
  } catch (err) {
    if (err instanceof SyntaxError) return error(null, -32700, "Parse error");
    throw err;
  }
}
