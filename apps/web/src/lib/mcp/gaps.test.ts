import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/actor";
import { ApiError } from "@/lib/http";

const m = vi.hoisted(() => ({
  listConnectionsFor: vi.fn(),
  listChannels: vi.fn(),
  runHistoryFor: vi.fn(),
  activityReport: vi.fn(),
  createJobFromBody: vi.fn(),
  updateJob: vi.fn(),
  setIgnored: vi.fn(),
  setFindingStatus: vi.fn(),
  addTrackedExpiration: vi.fn(),
  getConnection: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock("@/lib/connections-read", () => ({ listConnectionsFor: m.listConnectionsFor }));
vi.mock("@/lib/alerts/channels", () => ({ listChannels: m.listChannels }));
vi.mock("@/lib/run-history", () => ({ runHistoryFor: m.runHistoryFor }));
vi.mock("@/lib/activity-report", () => ({ activityReport: m.activityReport }));
vi.mock("@/lib/checkin-create", () => ({ createJobFromBody: m.createJobFromBody }));
vi.mock("@/lib/checkins", async (orig) => ({ ...(await orig<typeof import("@/lib/checkins")>()), updateJob: m.updateJob }));
vi.mock("@/lib/ignores", async (orig) => ({ ...(await orig<typeof import("@/lib/ignores")>()), setIgnored: m.setIgnored }));
vi.mock("@/lib/findings-status", () => ({ setFindingStatus: m.setFindingStatus }));
vi.mock("@/lib/expirations/add", () => ({ addTrackedExpiration: m.addTrackedExpiration }));
vi.mock("@/lib/connections", async (orig) => ({ ...(await orig<typeof import("@/lib/connections")>()), getConnection: m.getConnection }));
vi.mock("@/lib/sync", async (orig) => ({ ...(await orig<typeof import("@/lib/sync")>()), startSync: m.startSync }));

import { handleMessage } from "./protocol";
import { toolsFor } from "./tools";

const actor = (scopes: Actor["scopes"]): Actor => ({ userId: "user-1", via: "api_key", scopes, apiKeyId: "k1", label: "api_key:k1" });
const ID = "11111111-2222-3333-4444-555555555555";
const SECRET_LINK = "https://spooky.example/api/ping/SECRETTOKEN123";

async function call(scopes: Actor["scopes"], name: string, args: Record<string, unknown> = {}) {
  const tools = toolsFor(actor(scopes));
  return handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, tools);
}
const text = (res: unknown) => JSON.stringify(res);

beforeEach(() => { vi.clearAllMocks(); });

const READS = ["list_connections", "list_alert_channels", "job_history", "recent_activity"];
const WRITES: [string, Record<string, unknown>][] = [
  ["create_job", { name: "Nightly backup", periodMinutes: 1440 }],
  ["retire_job", { job_id: ID }],
  ["restore_job", { job_id: ID }],
  ["ignore_break", { key: "dpl_1:2026-11-01", project: "me/app" }],
  ["unignore_break", { key: "dpl_1:2026-11-01", project: "me/app" }],
  ["set_suggestion_status", { finding_id: ID, status: "dismissed" }],
  ["add_expiration", { kind: "api_key", name: "STRIPE_KEY_PROD", expiresOn: "2027-01-01" }],
  ["sync_connection", { connection_id: ID }],
];

it("read tools are available to read keys and write tools are hidden from them", () => {
  const read = toolsFor(actor(["read"]));
  const write = toolsFor(actor(["read", "write"]));
  for (const name of READS) { expect(read[name]).toBeDefined(); expect(read[name].annotations.readOnlyHint).toBe(true); }
  for (const [name] of WRITES) { expect(read[name]).toBeUndefined(); expect(write[name].annotations.readOnlyHint).toBe(false); }
});

it.each(WRITES)("%s is refused for a read-only key", async (name, args) => {
  expect(await call(["read"], name, args)).toMatchObject({ error: { message: "Unknown tool" } });
  for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
});

it("never offers destructive, key, connect, secret or test-alert tools", () => {
  const names = Object.keys(toolsFor(actor(["read", "write", "approve"])));
  expect(names.filter((n) => /delete|remove|revoke|api_key|connect_|test_alert|add_alert|dismiss_check/.test(n))).toEqual([]);
});

it("list_connections reads for the calling user only", async () => {
  m.listConnectionsFor.mockResolvedValue([{ id: ID, provider: "vercel", status: "active" }]);
  const res = await call(["read"], "list_connections");
  expect(m.listConnectionsFor).toHaveBeenCalledWith("user-1");
  expect(text(res)).toContain("vercel");
});

it("list_alert_channels passes the user id and hides any URL in errors", async () => {
  m.listChannels.mockResolvedValue([{ id: ID, kind: "slack", label: "Slack webhook", project: null, enabled: true, lastOkAt: null, lastError: "post to https://hooks.slack.com/services/T0/B0/SECRET failed", createdAt: "x" }]);
  const out = text(await call(["read"], "list_alert_channels"));
  expect(m.listChannels).toHaveBeenCalledWith("user-1");
  expect(out).toContain("Slack webhook");
  expect(out).not.toContain("SECRET");
  expect(out).not.toContain("hooks.slack.com");
});

it("job_history and recent_activity pass the user id", async () => {
  m.runHistoryFor.mockResolvedValue({ jobs: [] });
  m.activityReport.mockResolvedValue({ items: [], failedDeployments: [] });
  await call(["read"], "job_history");
  await call(["read"], "recent_activity", { limit: 5, since: "2026-11-01" });
  expect(m.runHistoryFor).toHaveBeenCalledWith("user-1");
  expect(m.activityReport).toHaveBeenCalledWith("user-1", 5, "2026-11-01");
  expect(text(await call(["read"], "recent_activity", { limit: 0 }))).toContain("limit");
});

it("create_job passes the actor and never returns the token or ping URL", async () => {
  m.createJobFromBody.mockResolvedValue({ id: ID, name: "Nightly backup", status: "new", pingUrl: SECRET_LINK });
  const out = text(await call(["read", "write"], "create_job", { name: "Nightly backup", periodMinutes: 1440 }));
  expect(m.createJobFromBody).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", label: "api_key:k1" }), { name: "Nightly backup", periodMinutes: 1440 });
  expect(out).toContain("Nightly backup");
  expect(out).not.toContain("SECRETTOKEN123");
  expect(out).not.toContain("/api/ping/");
  expect(out).toContain("web app");
});

it("create_job shows validation errors from the shared code", async () => {
  m.createJobFromBody.mockRejectedValue(new ApiError(400, "period", "periodMinutes: whole minutes, 1 to 44640"));
  expect(text(await call(["read", "write"], "create_job", { name: "Nightly backup" }))).toContain("periodMinutes");
});

it.each([["retire_job", true], ["restore_job", false]] as const)("%s updates only the caller's job and hides the link", async (name, retired) => {
  m.updateJob.mockResolvedValue({ id: ID, name: "Job", status: retired ? "retired" : "up", pingUrl: SECRET_LINK });
  const out = text(await call(["read", "write"], name, { job_id: ID }));
  expect(m.updateJob).toHaveBeenCalledWith("user-1", ID, { retired }, "api_key:k1");
  expect(out).not.toContain("SECRETTOKEN123");
  m.updateJob.mockResolvedValue(null);
  expect(text(await call(["read", "write"], name, { job_id: ID }))).toContain("No such job");
});

it.each([["ignore_break", true], ["unignore_break", false]] as const)("%s passes the actor and trimmed input", async (name, ignored) => {
  m.setIgnored.mockResolvedValue({ key: "k", ignored });
  await call(["read", "write"], name, { key: " k ", project: "me/app" });
  expect(m.setIgnored).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "k", "me/app", ignored);
});

it("set_suggestion_status passes the actor and checks the status", async () => {
  m.setFindingStatus.mockResolvedValue({ finding: { id: ID, status: "dismissed" } });
  await call(["read", "write"], "set_suggestion_status", { finding_id: ID, status: "dismissed" });
  expect(m.setFindingStatus).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), ID, "dismissed");
  expect(text(await call(["read", "write"], "set_suggestion_status", { finding_id: ID, status: "deleted" }))).toContain("status must be");
  expect(m.setFindingStatus).toHaveBeenCalledTimes(1);
});

it("add_expiration passes the actor and relays a secret refusal without echoing the value", async () => {
  m.addTrackedExpiration.mockResolvedValue({ id: ID, name: "STRIPE_KEY_PROD" });
  await call(["read", "write"], "add_expiration", { kind: "api_key", name: "STRIPE_KEY_PROD", expiresOn: "2027-01-01" });
  expect(m.addTrackedExpiration).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), { kind: "api_key", name: "STRIPE_KEY_PROD", expiresOn: "2027-01-01" });
  m.addTrackedExpiration.mockRejectedValue(new ApiError(400, "secret_value", "name: looks like a secret value; send only a name or short hint"));
  const out = text(await call(["read", "write"], "add_expiration", { kind: "token", name: "sk-live-abc", expiresOn: "2027-01-01" }));
  expect(out).toContain("looks like a secret");
  expect(out).not.toContain("sk-live-abc");
});

it("sync_connection looks the connection up by the caller's user id", async () => {
  m.getConnection.mockResolvedValue({ id: ID, userId: "user-1", provider: "vercel", status: "active", encryptedAccessToken: "TOKEN" });
  m.startSync.mockResolvedValue({ syncRunId: "run-1", workflowRunId: "wf-1" });
  const out = text(await call(["read", "write"], "sync_connection", { connection_id: ID }));
  expect(m.getConnection).toHaveBeenCalledWith(ID, "user-1");
  expect(m.startSync).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), "api_key:k1");
  expect(out).toContain("run-1");
  expect(out).not.toContain("TOKEN");
  m.getConnection.mockResolvedValue(null);
  expect(text(await call(["read", "write"], "sync_connection", { connection_id: ID }))).toContain("Connection not found");
});
