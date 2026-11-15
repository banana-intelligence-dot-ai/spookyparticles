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
  updateJobFromBody: vi.fn(),
  updateTrackedExpiration: vi.fn(),
  setVendorScope: vi.fn(),
  recomputeFindings: vi.fn(),
  startReadingFor: vi.fn(),
  buildExport: vi.fn(),
  setIgnored: vi.fn(),
  setFindingStatus: vi.fn(),
  addTrackedExpiration: vi.fn(),
  getConnection: vi.fn(),
  startSync: vi.fn(),
  openItemsFor: vi.fn(),
  agentsFor: vi.fn(),
  catchesFor: vi.fn(),
  clearedFor: vi.fn(),
  mutesFor: vi.fn(),
  publicFeedEnabled: vi.fn(),
  setCleared: vi.fn(),
  setMuted: vi.fn(),
  setPublicFeed: vi.fn(),
}));

vi.mock("@/lib/connections-read", () => ({ listConnectionsFor: m.listConnectionsFor }));
vi.mock("@/lib/alerts/channels", () => ({ listChannels: m.listChannels }));
vi.mock("@/lib/run-history", () => ({ runHistoryFor: m.runHistoryFor }));
vi.mock("@/lib/activity-report", () => ({ activityReport: m.activityReport }));
vi.mock("@/lib/checkin-create", () => ({ createJobFromBody: m.createJobFromBody }));
vi.mock("@/lib/checkin-update", () => ({ updateJobFromBody: m.updateJobFromBody }));
vi.mock("@/lib/expirations/update", () => ({ updateTrackedExpiration: m.updateTrackedExpiration }));
vi.mock("@/lib/findings", () => ({ setVendorScope: m.setVendorScope, recomputeFindings: m.recomputeFindings }));
vi.mock("@/lib/reading", () => ({ startReadingFor: m.startReadingFor }));
vi.mock("@/lib/export", () => ({ buildExport: m.buildExport }));
vi.mock("@/lib/checkins", async (orig) => ({ ...(await orig<typeof import("@/lib/checkins")>()), updateJob: m.updateJob }));
vi.mock("@/lib/ignores", async (orig) => ({ ...(await orig<typeof import("@/lib/ignores")>()), setIgnored: m.setIgnored, setCleared: m.setCleared, clearedFor: m.clearedFor }));
vi.mock("@/lib/mutes", async (orig) => ({ ...(await orig<typeof import("@/lib/mutes")>()), mutesFor: m.mutesFor, setMuted: m.setMuted }));
vi.mock("@/lib/public-fixes", async (orig) => ({ ...(await orig<typeof import("@/lib/public-fixes")>()), publicFeedEnabled: m.publicFeedEnabled, setPublicFeed: m.setPublicFeed }));
vi.mock("@/lib/open-items", async (orig) => ({ ...(await orig<typeof import("@/lib/open-items")>()), openItemsFor: m.openItemsFor }));
vi.mock("@/lib/agents", async (orig) => ({ ...(await orig<typeof import("@/lib/agents")>()), agentsFor: m.agentsFor }));
vi.mock("@/lib/catches", async (orig) => ({ ...(await orig<typeof import("@/lib/catches")>()), catchesFor: m.catchesFor }));
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

const READS = ["public_feed", "list_connections", "list_alert_channels", "job_history", "recent_activity", "open_items", "fix_history", "list_agents", "list_mutes"];
const WRITES: [string, Record<string, unknown>][] = [
  ["create_job", { name: "Nightly backup", periodMinutes: 1440 }],
  ["retire_job", { job_id: ID }],
  ["update_job", { job_id: ID, name: "Renamed" }],
  ["restore_job", { job_id: ID }],
  ["ignore_break", { key: "dpl_1:2026-11-01", project: "me/app" }],
  ["unignore_break", { key: "dpl_1:2026-11-01", project: "me/app" }],
  ["set_suggestion_status", { finding_id: ID, status: "dismissed" }],
  ["add_expiration", { kind: "api_key", name: "STRIPE_KEY_PROD", expiresOn: "2027-01-01" }],
  ["update_expiration", { expiration_id: ID, expiresOn: "2027-02-01" }],
  ["set_vendor_scope", { vendor_key: "acme", scope: "work" }],
  ["recompute_spend_findings", {}],
  ["read_billing_mail", { connection_id: ID, limit: 10 }],
  ["sync_connection", { connection_id: ID }],
  ["clear_notice", { key: "notice-1", project: "me/app" }],
  ["restore_notice", { key: "notice-1", project: "me/app" }],
  ["mute", { project: "me/app", kind: "deploy", reason: "retired" }],
  ["unmute", { project: "me/app", kind: "deploy" }],
  ["set_public_feed", { on: false }],
  ["add_alert_channel", { kind: "email", target: "owner@example.com" }],
  ["update_alert_channel", { channel_id: ID, project: null }],
  ["remove_alert_channel", { channel_id: ID }],
  ["test_alert_channel", { channel_id: ID }],
  ["send_test_alert", {}],
  ["delete_job", { job_id: ID }],
  ["delete_expiration", { expiration_id: ID }],
  ["dismiss_check", { finding_id: ID }],
  ["restore_check", { finding_id: ID }],
  ["revoke_connection", { connection_id: ID }],
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

const APPROVE = ["list_api_keys", "create_api_key", "revoke_api_key", "approve_agent_sign_in", "delete_account", "cancel_account_deletion", "account_deletion_status"];

it("read keys see no write or approve tools", () => {
  const read = toolsFor(actor(["read"]));
  for (const name of [...WRITES.map(([name]) => name), ...APPROVE]) expect(read[name]).toBeUndefined();
});

it("read and write keys see no approve tools", () => {
  const write = toolsFor(actor(["read", "write"]));
  for (const name of APPROVE) expect(write[name]).toBeUndefined();
});

it("full control keys see every approve tool", () => {
  const full = toolsFor(actor(["read", "write", "approve"]));
  for (const name of APPROVE) expect(full[name]).toBeDefined();
});

it("delete, remove and revoke tools carry a destructive hint", () => {
  const full = toolsFor(actor(["read", "write", "approve"]));
  for (const [name, value] of Object.entries(full)) {
    if (/^(delete|remove|revoke)_/.test(name)) expect(value.annotations).toMatchObject({ destructiveHint: true });
  }
});

it("tool schemas and descriptions contain no database secret or bypass instruction", () => {
  const full = toolsFor(actor(["read", "write", "approve"]));
  for (const value of Object.values(full)) expect(JSON.stringify({ description: value.description, inputSchema: value.inputSchema })).not.toMatch(/DATABASE_URL|bypass/i);
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

it("new read tools use the calling user", async () => {
  m.openItemsFor.mockResolvedValue({ onYou: [], withAgents: [] });
  m.catchesFor.mockResolvedValue({ catches: [], summary: {} });
  m.agentsFor.mockResolvedValue({ agents: [] });
  m.mutesFor.mockResolvedValue([]);
  m.clearedFor.mockResolvedValue([]);
  m.publicFeedEnabled.mockResolvedValue(false);
  for (const name of ["open_items", "fix_history", "list_agents", "list_mutes", "public_feed"]) await call(["read"], name);
  for (const fn of [m.openItemsFor, m.catchesFor, m.agentsFor, m.mutesFor, m.clearedFor, m.publicFeedEnabled]) expect(fn).toHaveBeenCalledWith("user-1");
});

it("mute passes project, kind, and reason through", async () => {
  m.setMuted.mockResolvedValue({ muted: true, mute: null });
  await call(["read", "write"], "mute", { project: " me/app ", kind: "deploy", reason: " retired " });
  expect(m.setMuted).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), { project: "me/app", kind: "deploy", reason: "retired" }, true);
});

it("clear_notice refuses a request without key or keys", async () => {
  expect(text(await call(["read", "write"], "clear_notice", { project: "me/app" }))).toContain("Send key or keys");
  expect(m.setCleared).not.toHaveBeenCalled();
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

it("public feed: read for the calling user, set through the audited store", async () => {
  m.publicFeedEnabled.mockResolvedValue(true);
  expect(text(await call(["read"], "public_feed"))).toContain('\\"on\\":true');
  expect(m.publicFeedEnabled).toHaveBeenCalledWith("user-1");
  m.setPublicFeed.mockResolvedValue(false);
  await call(["read", "write"], "set_public_feed", { on: false });
  expect(m.setPublicFeed).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", label: "api_key:k1" }), false);
  expect(await call(["read", "write"], "set_public_feed", { on: "yes" })).toMatchObject({ error: expect.anything() });
});


it("update_job passes the actor and hides the ping URL", async () => {
  m.updateJobFromBody.mockResolvedValue({ id: ID, name: "Renamed", pingUrl: SECRET_LINK });
  const out = text(await call(["read", "write"], "update_job", { job_id: ID, name: "Renamed", paused: true }));
  expect(m.updateJobFromBody).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", label: "api_key:k1" }), ID, { name: "Renamed", paused: true });
  expect(out).toContain("Renamed");
  expect(out).not.toContain("SECRETTOKEN123");
  expect(out).not.toContain("/api/ping/");
  expect(text(await call(["read", "write"], "update_job", { job_id: ID, retired: true }))).toContain("Unexpected tool argument");
});

it("update_expiration passes the actor and does not echo a refused secret", async () => {
  m.updateTrackedExpiration.mockResolvedValue({ id: ID, name: "STRIPE_KEY_PROD" });
  await call(["read", "write"], "update_expiration", { expiration_id: ID, expiresOn: "2027-02-01" });
  expect(m.updateTrackedExpiration).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), ID, { expiresOn: "2027-02-01" });
  m.updateTrackedExpiration.mockRejectedValue(new ApiError(400, "secret_value", "name: looks like a secret value; send only a name or short hint"));
  const out = text(await call(["read", "write"], "update_expiration", { expiration_id: ID, name: "sk-live-abc" }));
  expect(out).toContain("looks like a secret");
  expect(out).not.toContain("sk-live-abc");
});

it("vendor scope and recompute pass the calling actor", async () => {
  m.setVendorScope.mockResolvedValue({ vendorKey: "acme", scope: "work" });
  m.recomputeFindings.mockResolvedValue({ findings: 1, subscriptions: 1 });
  await call(["read", "write"], "set_vendor_scope", { vendor_key: "acme", scope: "work" });
  await call(["read", "write"], "recompute_spend_findings");
  expect(m.setVendorScope).toHaveBeenCalledWith("user-1", "acme", "work", "api_key:k1");
  expect(m.recomputeFindings).toHaveBeenCalledWith("user-1", "api_key:k1");
});

it("read_billing_mail uses the caller's connection and audit label", async () => {
  const connection = { id: ID, userId: "user-1", provider: "gmail" };
  m.getConnection.mockResolvedValue(connection);
  m.startReadingFor.mockResolvedValue({ started: true });
  await call(["read", "write"], "read_billing_mail", { connection_id: ID, limit: 10 });
  expect(m.getConnection).toHaveBeenCalledWith(ID, "user-1");
  expect(m.startReadingFor).toHaveBeenCalledWith(connection, "api_key:k1", { maxMessages: 10 });
});

it("export_data is available to read keys and uses the audited builder", async () => {
  m.buildExport.mockResolvedValue({ nodes: [], auditLog: [] });
  await call(["read"], "export_data");
  expect(m.buildExport).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", label: "api_key:k1" }));
  m.buildExport.mockResolvedValue({ nodes: Array(30000).fill("large"), auditLog: [] });
  const out = text(await call(["read"], "export_data"));
  expect(out).toContain("tooLarge");
  expect(out).toContain("30000");
  expect(out).not.toContain("large");
});
