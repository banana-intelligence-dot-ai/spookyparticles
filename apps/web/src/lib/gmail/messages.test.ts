import { describe, expect, it } from "vitest";
import { toHeaderView, toMessageRow, type GmailMetadataMessage } from "./messages";
import { classifyHeader } from "../tier0";

const msg = (headers: Record<string, string>, extra: Partial<GmailMetadataMessage> = {}): GmailMetadataMessage => ({
  id: "18c0ffee",
  threadId: "18c0ffee",
  labelIds: ["INBOX", "CATEGORY_UPDATES"],
  internalDate: "1730505600000",
  payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  ...extra,
});

describe("Tier 0 header to messages mapping", () => {
  it("maps Gmail metadata headers to a messages row", () => {
    const row = toMessageRow(
      msg({
        From: "Vercel <billing@vercel.com>",
        "Reply-To": "support@vercel.com",
        Subject: "Your receipt from Vercel #1234",
        Date: "Fri, 01 Nov 2024 10:00:00 +0000",
      }),
      "conn-1",
      "query:billing_senders",
    );
    expect(row).toEqual({
      connectionId: "conn-1",
      gmailMessageId: "18c0ffee",
      threadId: "18c0ffee",
      from: "Vercel <billing@vercel.com>",
      replyTo: "support@vercel.com",
      subject: "Your receipt from Vercel #1234",
      date: new Date("2024-11-01T10:00:00Z"),
      listUnsubscribe: false,
      labels: ["INBOX", "CATEGORY_UPDATES"],
      attachmentNames: [],
      tier0Reason: "query:billing_senders",
    });
  });

  it("matches header names case-insensitively and flags List-Unsubscribe", () => {
    const v = toHeaderView(msg({ from: "a@b.com", SUBJECT: "Hi", "list-unsubscribe": "<mailto:u@b.com>" }));
    expect(v.from).toBe("a@b.com");
    expect(v.subject).toBe("Hi");
    expect(v.listUnsubscribe).toBe(true);
  });

  it("falls back to internalDate when the Date header is missing or invalid", () => {
    expect(toHeaderView(msg({ Date: "not a date" })).date).toEqual(new Date(1730505600000));
    expect(toHeaderView(msg({})).date).toEqual(new Date(1730505600000));
  });

  it("collects attachment filenames from nested parts when present", () => {
    const v = toHeaderView(
      msg({}, { payload: { headers: [], parts: [{ filename: "" }, { parts: [{ filename: "invoice-0042.pdf" }] }] } }),
    );
    expect(v.attachmentNames).toEqual(["invoice-0042.pdf"]);
  });

  it("handles a message with no payload", () => {
    const row = toMessageRow({ id: "x", threadId: "t" }, "c", "exhaustive");
    expect(row).toMatchObject({ from: null, subject: null, date: null, labels: [], listUnsubscribe: false });
  });

  it("keeps billing senders and receipt subjects, skips newsletters and sent mail", () => {
    const view = (h: Record<string, string>, labels?: string[]) =>
      toHeaderView(msg(h, labels ? { labelIds: labels } : {}));
    expect(classifyHeader(view({ From: "Vercel <billing@vercel.com>", Subject: "Hello" })).candidate).toBe(true);
    expect(classifyHeader(view({ From: "shop@unknown.dev", Subject: "Your invoice for March" })).candidate).toBe(true);
    expect(
      classifyHeader(view({ From: "news@blog.dev", Subject: "Weekly digest", "List-Unsubscribe": "<x>" })).candidate,
    ).toBe(false);
    expect(classifyHeader(view({ From: "me@me.com", Subject: "Re: invoice" }, ["SENT"])).candidate).toBe(false);
  });
});
