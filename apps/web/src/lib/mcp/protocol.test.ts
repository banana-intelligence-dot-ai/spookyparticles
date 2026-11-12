import { describe, expect, it, vi } from "vitest";
import { handleJsonRpc, handleMessage, type ToolRegistry } from "./protocol";

const run = vi.fn(async (input: Record<string, unknown>) => ({ echo: input.project }));
const tools: ToolRegistry = {
  project_status: {
    description: "Read a project.",
    inputSchema: {
      type: "object", properties: { project: { type: "string" } }, required: ["project"], additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    validate: (input) => typeof input.project === "string" ? null : "project is required",
    run,
  },
};
const request = (method: string, params?: object, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

describe("MCP JSON-RPC protocol", () => {
  it("negotiates a supported version and falls back to the newest", async () => {
    const supported = await handleMessage(request("initialize", { protocolVersion: "2025-03-26" }), tools);
    expect(supported).toMatchObject({ result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "spooky-particles" } } });
    const fallback = await handleMessage(request("initialize", { protocolVersion: "2099-01-01" }), tools);
    expect(fallback).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  it("lists read-only tools with JSON Schema inputs", async () => {
    expect(await handleMessage(request("tools/list"), tools)).toEqual({
      jsonrpc: "2.0", id: 1,
      result: { tools: [{ name: "project_status", description: "Read a project.", inputSchema: tools.project_status.inputSchema, annotations: { readOnlyHint: true } }] },
    });
  });

  it("calls a tool and returns text plus matching structured content", async () => {
    const response = await handleMessage(request("tools/call", { name: "project_status", arguments: { project: "owner/repo" } }), tools);
    expect(response).toEqual({ jsonrpc: "2.0", id: 1, result: {
      content: [{ type: "text", text: '{"echo":"owner/repo"}' }], structuredContent: { echo: "owner/repo" },
    } });
    expect(run).toHaveBeenCalledWith({ project: "owner/repo" });
  });

  it("rejects unknown tools and bad arguments", async () => {
    expect(await handleMessage(request("tools/call", { name: "missing" }), tools)).toMatchObject({ error: { code: -32602 } });
    expect(await handleMessage(request("tools/call", { name: "toString" }), tools)).toMatchObject({ error: { code: -32602 } });
    expect(await handleMessage(request("tools/call", { name: "project_status", arguments: {} }), tools)).toMatchObject({ error: { code: -32602 } });
  });

  it("turns tool failures into safe tool results", async () => {
    const failing = { ...tools, project_status: { ...tools.project_status, run: async () => { throw new Error("secret stack trace"); } } };
    const response = await handleMessage(request("tools/call", { name: "project_status", arguments: { project: "a" } }), failing);
    expect(response).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(response)).not.toContain("secret stack trace");
  });

  it("handles batches and suppresses notification responses", async () => {
    const response = await handleMessage([
      request("ping", undefined, 1),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      request("missing", undefined, 2),
    ], tools);
    expect(response).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found" } },
    ]);
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools)).toBeNull();
  });

  it("distinguishes parse errors from invalid requests", async () => {
    expect(await handleJsonRpc("{", tools)).toMatchObject({ error: { code: -32700 } });
    expect(await handleMessage({}, tools)).toMatchObject({ error: { code: -32600 } });
  });
});
