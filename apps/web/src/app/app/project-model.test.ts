import { describe, expect, it } from "vitest";

/** Counts carry a non-breaking space; compare as plain text. */
const plain = (s: string) => s.replace(/\u00a0/g, " ");
import { layoutDrift, driftReach } from "@/components/constellation/drift";
import type { Star } from "@/components/constellation/layout";
import { dayKey, inboxNamer, noticeSentence, type Notice } from "./project-model";

const NOW = Date.parse("2026-11-02T18:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW - days * DAY).toISOString();

const notice = (over: Partial<Notice>): Notice => ({
  id: "n",
  kind: "receipt",
  vendor: "Supabase",
  subject: null,
  inbox: "you@example.com",
  at: at(1),
  amountCents: null,
  currency: "USD",
  dueAt: null,
  projectNames: [],
  domainNames: [],
  verified: true,
  plan: null,
  vendorUrl: null,
  ...over,
});

describe("noticeSentence", () => {
  it("charges read vendor, amount, plan", () => {
    const s = noticeSentence(notice({ amountCents: 2500, plan: "Pro" }), NOW);
    expect(`${s.text} ${s.amount}, ${s.detail}`).toBe("Supabase charged $25.00, Pro");
  });
  it("renewals name the domain, when, and the rounded amount", () => {
    const s = noticeSentence(
      notice({ kind: "renewal_notice", vendor: "Namecheap", domainNames: ["example.ai"], dueAt: new Date(NOW + 18 * DAY).toISOString(), amountCents: 7000 }),
      NOW,
    );
    expect(plain(`${s.text}, ${s.amount}`)).toBe("example.ai renews in 18 days, $70");
  });
  it("other notices keep the vendor and subject", () => {
    const s = noticeSentence(notice({ kind: "deployment", vendor: "Vercel", subject: "Deployment failed: app (production)" }), NOW);
    expect(s).toEqual({ vendor: "Vercel", text: "Deployment failed: app (production)", amount: null, detail: null });
  });
});

describe("inboxNamer", () => {
  it("shortens unless two inboxes would read the same", () => {
    const name = inboxNamer(["alex@example.com", "ops@example.com", "adam@example.com"]);
    expect(name("ops@example.com")).toBe("o…@example.com");
    expect(name("alex@example.com")).toBe("alex@example.com");
  });
});

describe("layoutDrift", () => {
  const star = (id: string, days: number | null, cents: number | null = null): Star => ({
    id,
    kind: "subscription",
    label: id,
    hub: false,
    parent: null,
    cluster: "inbox:a",
    activityAt: days === null ? null : at(days),
    monthlyCents: cents,
    status: null,
  });

  it("puts today on the left and older to the right", () => {
    expect(driftReach(at(0), NOW)).toBe(0);
    expect(driftReach(at(30), NOW)!).toBeLessThan(driftReach(at(365), NOW)!);
    expect(driftReach(null, NOW)).toBeNull();
  });

  it("never overlaps points, even 150 in one lane", () => {
    const stars = Array.from({ length: 150 }, (_, i) => star(`s${i}`, (i % 31) + 0.5, i % 5 ? 500 : null));
    const sky = layoutDrift({ stars, links: [], clusters: [{ id: "inbox:a", label: "a@example.com", sub: "" }], width: 1100, now: NOW });
    expect(sky.stars).toHaveLength(150);
    for (let i = 0; i < sky.stars.length; i++) {
      for (let j = i + 1; j < sky.stars.length; j++) {
        const a = sky.stars[i];
        const b = sky.stars[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
    const lane = sky.lanes[0];
    for (const s of sky.stars) expect(s.y).toBeGreaterThan(lane.y);
    for (const s of sky.stars) expect(s.y).toBeLessThan(lane.y + lane.h);
  });
});

describe("dayKey", () => {
  it("keeps a date-only receipt on its own day in any time zone", () => {
    expect(dayKey("2026-11-02T00:00:00.000Z")).toBe("2026-10-2");
  });
});

describe("siteConfirmedDown", () => {
  it("is false after one failed check and true once the alert bar is met", async () => {
    const { siteConfirmedDown } = await import("./project-model");
    expect(siteConfirmedDown({ uptime: { state: "down", alertAt: null } })).toBe(false);
    expect(siteConfirmedDown({ uptime: { state: "down", alertAt: "2026-11-11T02:05:00.000Z" } })).toBe(true);
    expect(siteConfirmedDown({ uptime: { state: "up", alertAt: null } })).toBe(false);
    expect(siteConfirmedDown({ uptime: null })).toBe(false);
  });
});
