import { describe, expect, it } from "vitest";
import { cleanNoticeSubject, emailSearchUrl, noticeRemedy, type RemedyNotice } from "./notice-remedy";

const n = (over: Partial<RemedyNotice>): RemedyNotice => ({ kind: "account_security", vendor: "GitHub", subject: null, inbox: "me@example.com", projectNames: [], vendorUrl: null, ...over });

describe("cleanNoticeSubject", () => {
  it("drops a bracketed sender that repeats the vendor", () => {
    expect(cleanNoticeSubject("[GitHub] A new public key was added to n8peace/news-factory", "GitHub")).toBe("A new public key was added to n8peace/news-factory");
  });
  it("keeps a bracket that names something else", () => {
    expect(cleanNoticeSubject("[Action required] Verify", "GitHub")).toBe("[Action required] Verify");
    expect(cleanNoticeSubject(null, "GitHub")).toBeNull();
  });
});

describe("noticeRemedy", () => {
  it("a deploy key added links to the repo's key settings", () => {
    const r = noticeRemedy(n({ subject: "[GitHub] A new public key was added to n8peace/news-factory" }));
    expect(r.means).toContain("n8peace/news-factory");
    expect(r.todo).toMatch(/If you or your agent added it/);
    expect(r.action).toEqual({ label: "Open deploy keys", href: "https://github.com/n8peace/news-factory/settings/keys" });
  });
  it("a new sign-in says what to do if it was not you", () => {
    const r = noticeRemedy(n({ subject: "[GitHub] New sign-in to your account from a new device" }));
    expect(r.todo).toMatch(/change the password/);
    expect(r.action?.href).toBe("https://github.com/settings/security-log");
  });
  it("a token or OAuth app added links to where it is revoked", () => {
    expect(noticeRemedy(n({ subject: "A personal access token was added to your account" })).action?.href).toBe("https://github.com/settings/tokens");
    expect(noticeRemedy(n({ subject: "A third-party OAuth application has been added" })).action?.href).toBe("https://github.com/settings/applications");
  });
  it("a token expiring says to replace it", () => {
    const r = noticeRemedy(n({ subject: "Your personal access token is about to expire" }));
    expect(r.means).toMatch(/stops working soon/);
    expect(r.todo).toMatch(/Make a new one/);
  });
  it("a failed payment opens billing", () => {
    const r = noticeRemedy(n({ kind: "payment_failed", vendor: "Vercel", subject: "Payment failed", vendorUrl: "https://vercel.com/account/billing" }));
    expect(r.action).toEqual({ label: "Open billing", href: "https://vercel.com/account/billing" });
  });
  it("anything else links to the original email", () => {
    const r = noticeRemedy(n({ vendor: "Supabase", subject: "Something changed" }));
    expect(r.action?.label).toBe("Find the email");
    expect(r.action?.href).toBe(emailSearchUrl({ inbox: "me@example.com", subject: "Something changed" }));
  });
  it("never uses dashes in its words", () => {
    const subjects = ["A new public key was added to a/b", "New sign-in", "OAuth application authorized", "token will expire", "Payment failed", "Hello"];
    for (const subject of subjects) {
      const r = noticeRemedy(n({ subject }));
      expect(`${r.means} ${r.todo}`).not.toMatch(/[–—]/);
    }
  });
});
