import { describe, expect, it } from "vitest";
import { sinceQuery } from "@/workflows/backfill-gmail";
import { mailDue, mailSince } from "./sync";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const H = 3_600_000;

describe("mail re-read", () => {
  it("starts a day before the last clean read began", () => {
    expect(mailSince(new Date("2026-11-04T06:42:23Z"))).toBe("2026-11-03T06:42:23.000Z");
  });
  it("does a full read when no read ever finished cleanly", () => {
    expect(mailSince(null)).toBeNull();
  });
  it("asks Gmail for mail after that moment, in whole seconds", () => {
    expect(sinceQuery("2026-11-03T06:42:23.500Z")).toBe(`after:${Date.parse("2026-11-03T06:42:23Z") / 1000} -in:chats`);
  });
  it("is due once 20 hours pass since any run started", () => {
    expect(mailDue("active", new Date(NOW - 21 * H), NOW)).toBe(true);
    expect(mailDue("active", new Date(NOW - 2 * H), NOW)).toBe(false);
    expect(mailDue("active", null, NOW)).toBe(true);
  });
  it("leaves an inbox that needs a new sign-in alone", () => {
    expect(mailDue("errored", null, NOW)).toBe(false);
  });
});
