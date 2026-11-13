import { describe, expect, it } from "vitest";
import { mailReadAt, weekSummary, type Item } from "./activity-view";
import type { Connection } from "./connection-model";
import type { Notice } from "./project-model";

/** plural() joins the count with a no-break space. */
const sp = (t: string | undefined) => t?.replace(/\u00a0/g, " ");
const NOW = Date.parse("2026-11-12T18:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const notice = (kind: Notice["kind"], daysAgo: number, extra: Partial<Notice> = {}): Item => {
  const n: Notice = { id: `${kind}-${daysAgo}`, kind, vendor: "Vercel", subject: null, inbox: "a@b.c", at: iso(daysAgo), amountCents: null, currency: null, dueAt: null, projectNames: [], domainNames: [], verified: true, plan: null, vendorUrl: null, ...extra };
  return { type: "notice", id: n.id, at: n.at, kind, n };
};
const deploy = (name: string, daysAgo: number): Item => ({
  type: "deploy",
  id: `gh-${name}`,
  at: iso(daysAgo),
  kind: "deployment",
  d: { id: name, name, environment: "Production", url: null, state: "failure", at: iso(daysAgo), provider: "GitHub" },
  mail: null,
});
const gmail = (finishedAt: string | null, status: Connection["status"] = "active"): Connection => ({
  id: finishedAt ?? "x", provider: "gmail", display: "a@b.c", status, statusReason: null, scopes: [], createdAt: iso(30), lastSyncedAt: null,
  sync: { id: "s", phase: "done", scanned: 1, candidates: 0, error: null, paused: false, startedAt: iso(30), finishedAt, totalEstimate: null, remaining: 0, etaSeconds: 0, percent: 100 },
});

describe("weekSummary", () => {
  it("leads with a deploy that is still failing, however old", () => {
    const s = weekSummary([deploy("acme/site", 19)], NOW, iso(0));
    expect(sp(s.failing?.text)).toBe("1 deploy still failing");
    expect(s.failing?.red).toBe(true);
    expect(s.week).toEqual([]);
  });

  it("does not count a still-failing repo's mail again as a failed deploy this week", () => {
    const s = weekSummary([deploy("acme/site", 2), notice("deployment", 2, { projectNames: ["site"], subject: "Deploy failed" })], NOW, iso(0));
    expect(sp(s.failing?.text)).toBe("1 deploy still failing");
    expect(s.week.find((p) => p.text.includes("failed deploy"))).toBeUndefined();
  });

  it("says when mail was last read instead of calling the week quiet", () => {
    const s = weekSummary([notice("receipt", 9, { amountCents: 2000, currency: "USD" })], NOW, iso(8));
    expect(s.week).toEqual([]);
    expect(s.staleSince).toBe(iso(8));
  });

  it("treats mail read within two days as current", () => {
    expect(weekSummary([], NOW, iso(1)).staleSince).toBeNull();
  });

  it("counts this week's charges and failures", () => {
    const s = weekSummary([notice("receipt", 1, { amountCents: 4900, currency: "USD" }), notice("payment_failed", 3)], NOW, iso(0));
    expect(s.week.map((p) => sp(p.text))).toEqual(["1 failed payment", "1 charge for $49"]);
  });
});

describe("mailReadAt", () => {
  it("takes the newest finished read across live inboxes", () => {
    expect(mailReadAt([gmail(iso(8)), gmail(iso(3)), gmail(iso(0), "revoked"), gmail(null)])).toBe(iso(3));
  });
  it("is null with no finished read", () => {
    expect(mailReadAt([gmail(null)])).toBeNull();
  });
});
