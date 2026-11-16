import { describe, expect, it } from "vitest";
import { ApiError } from "./http";
import { routingStatus } from "./break-guide";
import { NO_RESPONDER, sendInput, sendMessage } from "./send-to-agent";

describe("sendInput", () => {
  it("cleans a good request", () => {
    expect(sendInput({ project: " me/app ", what: " Deploy failed ", jobId: null })).toEqual({ project: "me/app", what: "Deploy failed", jobId: null });
    const id = "0b9f1c7e-1a2b-4c3d-8e9f-0123456789ab";
    expect(sendInput({ project: "me/app", what: "Backup quiet", jobId: id }).jobId).toBe(id);
  });
  it.each([
    [{}],
    [{ project: "me/app" }],
    [{ project: "", what: "x" }],
    [{ project: "x".repeat(121), what: "x" }],
    [{ project: "me/app", what: "x".repeat(301) }],
    [{ project: "me/app", what: "x", jobId: "not-a-uuid" }],
    [null],
  ])("refuses %j", (body) => {
    expect(() => sendInput(body)).toThrow(ApiError);
  });
});

describe("sendMessage", () => {
  it("says it went", () => expect(sendMessage({ ok: true })).toEqual({ sent: true, message: "Sent. Your GitHub fix job is on it." }));
  it("tells how to add a fix job when there is none", () => {
    const r = sendMessage({ ok: false, reason: NO_RESPONDER });
    expect(r.sent).toBe(false);
    expect(r.message).toMatch(/No fix job is set up/);
    expect(r.message).toMatch(/setup\.md/);
  });
  it("passes GitHub's reason through", () => {
    expect(sendMessage({ ok: false, reason: "http 500" }).message).toBe("Not sent: http 500");
  });
});

describe("routingStatus with a GitHub job claim", () => {
  it("says a GitHub job took it, not that you claimed it", () => {
    const now = Date.parse("2026-11-16T20:10:00Z");
    const text = routingStatus("deploy_failed", { project: "me/app", agent: "a GitHub job", apiKeyId: null, at: "2026-11-16T20:08:00Z" }, now).text;
    expect(text).toMatch(/^Sent to your agents\. A GitHub job took it /);
    expect(text).not.toMatch(/You claimed/);
  });
});
