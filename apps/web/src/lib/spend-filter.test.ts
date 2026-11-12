import { describe, expect, it } from "vitest";
import { FINDINGS, SPEND } from "@/app/dev/onboarding/spend-fixtures";
import {
  UNLINKED,
  addressesOf,
  describeFilters,
  filterFindings,
  filterNotices,
  filterSpend,
  parseSpendFilters,
  spendApiReport,
  spendFacets,
  spendFilterQuery,
  spendTotals,
} from "./spend-filter";

const q = (s: string) => new URLSearchParams(s);
const vendors = (list: { vendor: string }[]) => list.map((s) => s.vendor);

describe("parseSpendFilters", () => {
  it("reads repeatable params, trims, dedupes, and lowercases addresses only", () => {
    const f = parseSpendFilters(q("project=hubot/notify-cli&project=%20hubot/notify-cli&project=unlinked&inbox=Billing@Example.com&inbox=billing@example.com"));
    expect(f).toEqual({ project: ["hubot/notify-cli", "unlinked"], inbox: ["billing@example.com"] });
    expect(parseSpendFilters(q(""))).toEqual({ project: [], inbox: [] });
    expect(spendFilterQuery(f)).toBe("project=hubot%2Fnotify-cli&project=unlinked&inbox=billing%40example.com");
  });
});

describe("filterSpend", () => {
  it("returns the report untouched when nothing is filtered", () => {
    expect(filterSpend(SPEND, { project: [], inbox: [] })).toBe(SPEND);
  });

  it("keeps a project's lines and redoes every total from them", () => {
    const r = filterSpend(SPEND, { project: ["hubot/notify-cli"], inbox: [] });
    expect(vendors(r.subscriptions).sort()).toEqual(["Railway", "Twilio"]);
    expect(r.monthlyCents).toBe(2230 + 500);
    expect(r.personalMonthlyCents).toBe(0);
    expect(r.activeCount).toBe(2);
    expect(r.byCategory.reduce((a, c) => a + c.monthlyCents, 0)).toBe(r.monthlyCents);
  });

  it("lists a line that pays for two repos under both", () => {
    const a = filterSpend(SPEND, { project: ["octocat/ledger-api"], inbox: [] });
    const b = filterSpend(SPEND, { project: ["octocat/edge-proxy"], inbox: [] });
    expect(vendors(a.subscriptions)).toContain("Vercel");
    expect(vendors(b.subscriptions)).toEqual(["Vercel"]);
  });

  it("matches project names case-insensitively, and unlinked means no repo", () => {
    const r = filterSpend(SPEND, { project: ["HUBOT/Notify-CLI"], inbox: [] });
    expect(r.subscriptions).toHaveLength(2);
    const u = filterSpend(SPEND, { project: [UNLINKED], inbox: [] });
    expect(u.subscriptions.every((s) => s.projects.length === 0)).toBe(true);
    expect(vendors(u.subscriptions)).toContain("Anthropic");
  });

  it("matches an address the bill arrived at or the address the vendor billed", () => {
    const billed = filterSpend(SPEND, { project: [], inbox: ["api@example.com"] });
    expect(vendors(billed.subscriptions)).toEqual(["OpenAI"]);
    const inbox = filterSpend(SPEND, { project: [], inbox: ["billing@example.com"] });
    // Vercel arrived in both inboxes, so it is in each.
    expect(vendors(inbox.subscriptions)).toContain("Vercel");
    expect(inbox.subscriptions.every((s) => addressesOf(s).includes("billing@example.com"))).toBe(true);
  });

  it("narrows when project and address are both set", () => {
    const r = filterSpend(SPEND, { project: ["octocat/ledger-api"], inbox: ["you@example.com"] });
    expect(vendors(r.subscriptions)).toEqual(["Vercel"]);
  });

  it("agrees with the server's own totals for the whole report", () => {
    const t = spendTotals(SPEND.subscriptions, SPEND.currency);
    expect(t.monthlyCents).toBe(SPEND.monthlyCents);
    expect(t.personalMonthlyCents).toBe(SPEND.personalMonthlyCents);
    expect(t.unknownMonthlyCents).toBe(SPEND.unknownMonthlyCents);
    expect(t.otherCurrencies).toEqual(SPEND.otherCurrencies);
  });
});

describe("spendFacets", () => {
  it("offers each linked repo with its work total, then unlinked last, and every address", () => {
    const f = spendFacets(SPEND.subscriptions, "USD");
    expect(f.projects[0]).toEqual({ key: "octocat/ledger-api", monthlyCents: 4000 + 2600, lines: 2 });
    expect(f.projects.at(-1)?.key).toBe(UNLINKED);
    expect(f.projects.map((p) => p.key)).toContain("hubot/notify-cli");
    expect(f.inboxes.map((i) => i.address).sort()).toEqual(["api@example.com", "billing@example.com", "ops@example.com", "you@example.com"]);
  });
});

describe("filterFindings and filterNotices", () => {
  it("keeps findings resting on a matching line's receipts or naming the repo", () => {
    const f = { project: ["hubot/notify-cli"], inbox: [] };
    const matching = filterSpend(SPEND, f).subscriptions;
    expect(filterFindings(FINDINGS, matching, f).map((x) => x.id)).toEqual(["f1"]);
    const byInbox = { project: [], inbox: ["billing@example.com"] };
    const ids = filterFindings(FINDINGS, filterSpend(SPEND, byInbox).subscriptions, byInbox).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["f2", "f3", "f4"]));
    expect(ids).not.toContain("f1");
  });

  it("keeps renewal emails from a matching line's vendor, sent to a chosen address", () => {
    const notices = [
      { vendor: "Railway", inbox: "you@example.com" },
      { vendor: "Namecheap", inbox: "you@example.com" },
      { vendor: "Railway", inbox: "ops@example.com" },
    ];
    const f = { project: ["hubot/notify-cli"], inbox: [] };
    expect(filterNotices(notices, filterSpend(SPEND, f).subscriptions, f)).toHaveLength(2);
    const g = { project: ["hubot/notify-cli"], inbox: ["you@example.com"] };
    expect(filterNotices(notices, filterSpend(SPEND, g).subscriptions, g)).toEqual([notices[0]]);
  });
});

describe("spendApiReport (GET /api/v1/spend body)", () => {
  // The server's report has no `projects` on a line; links come from linkSubscriptions.
  const server = { ...SPEND, subscriptions: SPEND.subscriptions.map(({ projects: _, ...s }) => s) };
  const links = new Map(SPEND.subscriptions.filter((s) => s.projects.length).map((s) => [s.id, s.projects]));

  it("keeps the unfiltered shape, adds repos to each line, echoes filters, lists facets", () => {
    const body = spendApiReport(server, links, { project: [], inbox: [] });
    expect(body.monthlyCents).toBe(SPEND.monthlyCents);
    expect(body.subscriptions).toHaveLength(SPEND.subscriptions.length);
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(["currency", "monthlyCents", "personalMonthlyCents", "unknownMonthlyCents", "byCategory", "otherCurrencies", "activeCount", "lapsedCount", "unverified", "subscriptions", "filters", "projects", "inboxes"]),
    );
    const twilio = body.subscriptions.find((s) => s.vendor === "Twilio")!;
    expect(twilio.projects).toEqual(["hubot/notify-cli"]);
    expect(Object.keys(twilio)).toEqual(expect.arrayContaining(["accountEmails", "projects", "receiptIds", "inboxes", "projectNames"]));
  });

  it("filters by project and still lists every project and address to pick from", () => {
    const filters = parseSpendFilters(q("project=hubot/notify-cli"));
    const body = spendApiReport(server, links, filters);
    expect(body.filters).toEqual({ project: ["hubot/notify-cli"], inbox: [] });
    expect(body.monthlyCents).toBe(2730);
    expect(vendors(body.subscriptions).sort()).toEqual(["Railway", "Twilio"]);
    expect(body.projects.length).toBeGreaterThan(2);
    expect(body.inboxes.length).toBe(4);
  });

  it("answers project=unlinked with lines no repo claims", () => {
    const body = spendApiReport(server, links, parseSpendFilters(q("project=unlinked&inbox=you@example.com")));
    expect(body.subscriptions.every((s) => s.projects.length === 0 && s.inboxes.includes("you@example.com"))).toBe(true);
    expect(describeFilters(body.filters)).toBe("not linked to a repo, you@example.com");
  });
});
