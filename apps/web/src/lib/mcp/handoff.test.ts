import { expect, it } from "vitest";
import type { Actor } from "@/lib/actor";
import { handleMessage, ToolError } from "./protocol";
import { toolsFor } from "./tools";

const actor = (scopes: Actor["scopes"]): Actor => ({ userId: "u", via: "api_key", scopes, label: "api_key:k" });
const call = (name: string) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name } });

it("lists write tools only for write-scoped keys", async () => {
  const read = toolsFor(actor(["read"]));
  const write = toolsFor(actor(["read", "write"]));
  expect(Object.keys(read)).toContain("list_findings");
  expect(Object.keys(read)).toContain("list_services");
  expect(Object.keys(read)).not.toContain("record_service");
  expect(Object.keys(read)).not.toContain("next_finding");
  expect(Object.keys(write)).toContain("report_finding");
  expect(Object.keys(write)).toContain("record_service");
  expect(write.next_finding.annotations.readOnlyHint).toBe(false);
  expect(await handleMessage(call("next_finding"), read)).toMatchObject({ error: { message: "Unknown tool" } });
});

it("passes only ToolError messages to the client", async () => {
  const base = toolsFor(actor(["read"])).list_findings;
  const visible = await handleMessage(call("list_findings"), { list_findings: { ...base, run: async () => { throw new ToolError("No in-progress attempt"); } } });
  const hidden = await handleMessage(call("list_findings"), { list_findings: { ...base, run: async () => { throw new Error("private database detail"); } } });
  expect(visible).toMatchObject({ result: { isError: true, content: [{ text: "No in-progress attempt" }] } });
  expect(JSON.stringify(hidden)).not.toContain("private database detail");
});
