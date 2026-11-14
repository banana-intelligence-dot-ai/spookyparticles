import { describe, expect, it, vi } from "vitest";
import { getDb, schema } from "@/db";
import { sendEmail } from "./email";
import { deliverToAll, deliverTo } from "./channels";

vi.mock("@/db", async (original) => ({ ...await original(), getDb: vi.fn() }));
vi.mock("./email", () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }));

describe("GitHub responders are not human destinations", () => {
  it("falls back to account email when GitHub is the only enabled channel", async () => {
    const db = { select: () => ({ from: (table: unknown) => ({ where: () => table === schema.alertChannels ? [{ kind: "github", project: "owner/repo" }] : { limit: async () => [{ email: "person@example.com" }] } }) }) };
    vi.mocked(getDb).mockReturnValue(db as never);
    expect(await deliverTo("github", "owner/repo", { subject: "Down", text: "Down" })).toEqual({ ok: false, reason: "GitHub jobs are not human alert channels" });
    const result = await deliverToAll("user-1", { subject: "Down", text: "Down" }, "owner/repo");
    expect(result).toEqual([{ kind: "email", label: "account email", ok: true, reason: undefined }]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
