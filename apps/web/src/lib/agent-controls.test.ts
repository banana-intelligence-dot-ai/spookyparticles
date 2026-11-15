import { beforeEach, expect, it, vi } from "vitest";
import { schema, getDb } from "@/db";
import type { Actor } from "./actor";
import { appendAudit } from "./audit";
import { createApiKey } from "./api-keys";
import { cancelDeletion, scheduleDeletion } from "./account-deletion";
import { addChannel, removeChannel, updateChannelProject } from "./alerts/channels";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("./audit", () => ({ appendAudit: vi.fn(async () => undefined) }));
vi.mock("./crypto", async (original) => ({ ...await original(), encrypt: vi.fn(() => ({ ciphertext: "sealed", keyId: "key-1" })) }));

const actor: Actor = { userId: "person-1", via: "api_key", scopes: ["read", "approve"], apiKeyId: "key-1", label: "api_key:key-1" };
const id = "11111111-2222-3333-4444-555555555555";

beforeEach(() => vi.clearAllMocks());

it("refuses scopes beyond the caller before making a key", async () => {
  await expect(createApiKey(actor, { name: "child", scopes: ["read", "write"] })).rejects.toMatchObject({ status: 403, code: "scope_exceeds_caller" });
  expect(getDb).not.toHaveBeenCalled();
});

it("requires the matching email for key-initiated account deletion", async () => {
  vi.mocked(getDb).mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ email: "Person@Example.com" }] }) }) }) } as never);
  await expect(scheduleDeletion(actor, { confirmEmail: "wrong@example.com" })).rejects.toMatchObject({ status: 400, code: "confirm_email" });
  expect(appendAudit).not.toHaveBeenCalled();
});

it("accepts a trimmed, case-insensitive email and returns an existing scheduled request", async () => {
  const scheduledFor = new Date("2026-11-22T00:00:00Z");
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: unknown) => ({
        where: () => table === schema.user
          ? { limit: async () => [{ email: "Person@Example.com" }] }
          : { orderBy: () => ({ limit: async () => [{ id, status: "scheduled", scheduledFor }] }) },
      }),
    }),
  } as never);
  expect(await scheduleDeletion(actor, { confirmEmail: " person@example.com " })).toEqual({ deletion: { id, status: "scheduled", scheduledFor }, revoked: [] });
  expect(appendAudit).not.toHaveBeenCalled();
});

it("cancels scheduled deletion and audits the key label", async () => {
  const set = vi.fn(() => ({ where: () => ({ returning: async () => [{ id }] }) }));
  vi.mocked(getDb).mockReturnValue({ update: () => ({ set }) } as never);
  expect(await cancelDeletion(actor)).toMatchObject({ cancelled: true });
  expect(set).toHaveBeenCalledWith({ status: "cancelled" });
  expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({ actor: actor.label, action: "account.deletion_cancelled" }));
});

it("uses the key label when adding, changing and removing a channel", async () => {
  const row = { id, userId: actor.userId, kind: "email", label: "pe…@example.com", project: null, enabled: true, lastOkAt: null, lastError: null, createdAt: new Date() };
  vi.mocked(getDb).mockReturnValue({
    insert: () => ({ values: () => ({ returning: async () => [row] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ ...row, project: "owner/repo" }] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [{ id }] }) }),
  } as never);
  expect((await addChannel(actor.userId, "email", "person@example.com", null, actor.label)).ok).toBe(true);
  await updateChannelProject(actor.userId, id, "owner/repo", actor.label);
  await removeChannel(actor.userId, id, actor.label);
  expect(vi.mocked(appendAudit).mock.calls.map(([entry]) => [entry.actor, entry.action])).toEqual([
    [actor.label, "alert_channel.added"], [actor.label, "alert_channel.updated"], [actor.label, "alert_channel.removed"],
  ]);
});

it("refuses to cancel once the deletion's time has come", async () => {
  vi.mocked(getDb).mockReturnValue({
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ id, status: "scheduled", scheduledFor: new Date() }] }) }) }) }),
  } as never);
  await expect(cancelDeletion(actor)).rejects.toMatchObject({ status: 409, code: "too_late" });
  expect(appendAudit).not.toHaveBeenCalled();
});

it("a key made by an expiring key expires no later than its maker", async () => {
  const parentExpiry = new Date("2027-01-01T00:00:00Z");
  const values = vi.fn((row: { expiresAt: Date | null }) => ({ returning: async () => [{ id, name: "child", prefix: "sp_xxxx", scopes: ["read"], expiresAt: row.expiresAt }] }));
  vi.mocked(getDb).mockReturnValue({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ expiresAt: parentExpiry }] }) }) }),
    insert: () => ({ values }),
  } as never);
  const made = await createApiKey(actor, { name: "child", scopes: ["read"] });
  expect(made.expiresAt).toEqual(parentExpiry);
  const later = await createApiKey(actor, { name: "child", scopes: ["read"], expiresOn: "2099-01-01" });
  expect(later.expiresAt).toEqual(parentExpiry);
});

it("refuses a non-text key name", async () => {
  await expect(createApiKey(actor, { name: 7 as never, scopes: ["read"] })).rejects.toMatchObject({ status: 400, code: "name" });
});
