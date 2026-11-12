import { describe, expect, it } from "vitest";
import { addressOf, domainsAlign, htmlToText, parseAuthResults, templateFingerprint, toEmailText, trimForModel } from "./body";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("parseAuthResults", () => {
  it("verifies a Gmail pass that aligns with the From domain", () => {
    const a = parseAuthResults(
      "mx.google.com; dkim=pass header.i=@vercel.com header.s=s1 header.b=abc; spf=pass (google.com: domain of bounce@em.vercel.com) smtp.mailfrom=bounce@em.vercel.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=vercel.com",
      "vercel.com",
    );
    expect(a).toMatchObject({ dkim: "pass", dmarc: "pass", spf: "pass", dkimDomain: "vercel.com", verified: true });
  });

  it("does not verify a pass for some other domain, or a fail", () => {
    expect(parseAuthResults("mx.google.com; dkim=pass header.i=@mailer.example header.s=x; dmarc=fail header.from=vercel.com", "vercel.com").verified).toBe(false);
    expect(parseAuthResults("mx.google.com; dkim=fail; spf=softfail; dmarc=fail", "vercel.com").verified).toBe(false);
    expect(parseAuthResults(null, "vercel.com").verified).toBe(false);
  });

  it("accepts relaxed alignment (subdomains)", () => {
    expect(domainsAlign("em.vercel.com", "vercel.com")).toBe(true);
    expect(domainsAlign("vercel.co", "vercel.com")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("keeps the words and the line structure, drops the markup", () => {
    const text = htmlToText(
      "<html><head><style>.x{}</style></head><body><h1>Receipt</h1><table><tr><td>Pro plan</td><td>$20.00</td></tr></table><p>Thanks &amp; see you</p></body></html>",
    );
    expect(text).toBe("Receipt\nPro plan $20.00\nThanks & see you");
  });
});

describe("toEmailText", () => {
  it("prefers text/plain, finds attachments, reads the sender", () => {
    const e = toEmailText({
      id: "m1",
      threadId: "t1",
      internalDate: "1761955200000",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Supabase <billing@supabase.com>" },
          { name: "Subject", value: "Your Supabase invoice" },
          { name: "Date", value: "Sat, 01 Nov 2026 00:00:00 +0000" },
          { name: "Authentication-Results", value: "mx.google.com; dkim=pass header.i=@supabase.com; dmarc=pass header.from=supabase.com" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: b64("Invoice total: $25.00\nPeriod: Oct 1 to Oct 31") } },
          { mimeType: "text/html", body: { data: b64("<p>Invoice total: $25.00</p>") } },
          { mimeType: "application/pdf", filename: "invoice-1234.pdf", body: { attachmentId: "a1" } },
        ],
      },
    });
    expect(e.fromAddress).toBe("billing@supabase.com");
    expect(e.fromDomain).toBe("supabase.com");
    expect(e.text).toContain("Invoice total: $25.00");
    expect(e.attachmentNames).toEqual(["invoice-1234.pdf"]);
    expect(e.auth.verified).toBe(true);
    expect(e.date?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("falls back to the HTML part as text", () => {
    const e = toEmailText({
      id: "m2",
      threadId: "t2",
      payload: { mimeType: "text/html", headers: [{ name: "From", value: "x@example.com" }], body: { data: b64("<div>Total <b>$9</b></div>") } },
    });
    expect(e.text).toBe("Total $9");
  });
});

describe("templateFingerprint", () => {
  it("is the same for two emails from one template and differs across templates", () => {
    const a = templateFingerprint("billing@vercel.com", "<table><tr><td>Total</td><td>$20.00</td></tr></table>");
    const b = templateFingerprint("billing@vercel.com", "<table><tr><td>Total</td><td>$340.00</td></tr></table>");
    const c = templateFingerprint("billing@vercel.com", "<div><p>Total $20.00</p></div>");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(templateFingerprint("x@y.z", null)).toBeNull();
  });
});

describe("addressOf and trimForModel", () => {
  it("parses display-name addresses", () => {
    expect(addressOf("Vercel <Invoice+Statements@Vercel.com>")).toBe("invoice+statements@vercel.com");
    expect(addressOf("not an address")).toBeNull();
  });
  it("cuts at a line and says so", () => {
    const t = trimForModel("line one\nline two\nline three", 14);
    expect(t.startsWith("line one\n")).toBe(true);
    expect(t).toMatch(/more characters not shown/);
    expect(trimForModel("short", 100)).toBe("short");
  });
});
