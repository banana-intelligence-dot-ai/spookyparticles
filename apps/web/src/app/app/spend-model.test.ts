import { describe, expect, it } from "vitest";
import { SPEND } from "../dev/onboarding/spend-fixtures";
import { NOW } from "../dev/onboarding/fixtures";
import type { Notice } from "./project-model";
import { filterSpend } from "@/lib/spend-filter";
import { canGo, cadenceNote, dueItems, repoLabeler, rowTrailer, viewFacets, viewSpend } from "./spend-model";
import { FINDINGS } from "../dev/onboarding/spend-fixtures";

const DAY = 86_400_000;

describe("viewSpend", () => {
  it("bars sum to the work headline and leave personal, unknown, foreign and unverified out", () => {
    const v = viewSpend(SPEND, {});
    expect(v.work.reduce((a, s) => a + (s.monthlyCents ?? 0), 0)).toBe(v.workCents);
    expect(v.work.every((s) => s.scope === "work" && s.verified && s.currency === "USD")).toBe(true);
    expect(v.foreign.map((s) => s.vendor)).toEqual(["Hetzner"]);
    expect(v.unverified).toHaveLength(1);
    expect(v.personal.map((s) => s.vendor)).toContain("Spotify");
    expect(v.stopped.every((s) => !s.active)).toBe(true);
    // Largest first.
    expect(v.work[0].vendor).toBe("Anthropic");
  });

  it("moves a vendor and its money the moment the user decides", () => {
    const before = viewSpend(SPEND, {});
    const setapp = SPEND.subscriptions.find((s) => s.vendor === "Setapp")!;
    const after = viewSpend(SPEND, { setapp: "work" });
    expect(after.workCents).toBe(before.workCents + setapp.monthlyCents!);
    expect(after.unknownCents).toBe(before.unknownCents - setapp.monthlyCents!);
    expect(after.unknown.some((s) => s.vendor === "Setapp")).toBe(false);
    const out = viewSpend(SPEND, { anthropic: "personal" });
    expect(out.workCents).toBe(before.workCents - 20000);
    expect(out.personal.some((s) => s.vendor === "Anthropic")).toBe(true);
  });
});

describe("dueItems", () => {
  const renewal: Notice = {
    id: "n1",
    kind: "renewal_notice",
    vendor: "Namecheap",
    subject: "renews soon",
    inbox: "you@example.com",
    at: new Date(NOW - 2 * DAY).toISOString(),
    amountCents: 7000,
    currency: "USD",
    dueAt: new Date(NOW + 18 * DAY).toISOString(),
    projectNames: [],
    domainNames: ["example.com"],
    verified: true,
    plan: null,
    vendorUrl: null,
  };

  it("keeps 60 days, drops personal, and lets a renewal email replace the expected charge", () => {
    const due = dueItems(SPEND, [renewal], {}, NOW);
    expect(due.every((d) => d.at >= NOW - DAY && d.at <= NOW + 60 * DAY)).toBe(true);
    expect(due.some((d) => d.vendor === "Spotify")).toBe(false);
    const namecheap = due.filter((d) => d.vendor === "Namecheap");
    expect(namecheap).toHaveLength(1);
    expect(namecheap[0]).toMatchObject({ kind: "renewal", tone: "amber", label: "example.com", amount: "$70.00" });
    // Sorted by date.
    expect(due.map((d) => d.at)).toEqual([...due.map((d) => d.at)].sort((a, b) => a - b));
  });

  it("brings monthly bills round again inside the window", () => {
    const anthropic = dueItems(SPEND, [], {}, NOW).filter((d) => d.vendor === "Anthropic");
    expect(anthropic).toHaveLength(2);
    expect(anthropic[1].repeat).toBe(true);
  });

  it("never trusts a renewal from a sender that failed checks", () => {
    expect(dueItems(SPEND, [{ ...renewal, verified: false }], {}, NOW).some((d) => d.kind === "renewal")).toBe(false);
  });

  it("says when an amount is an estimate", () => {
    const openai = dueItems(SPEND, [], {}, NOW).find((d) => d.vendor === "OpenAI")!;
    expect(openai.amount).toBe("about $37");
  });
});

describe("canGo and notes", () => {
  it("lists open money findings, largest first", () => {
    const list = canGo(FINDINGS);
    expect(list.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
  });
  it("names spread and averaged amounts", () => {
    expect(cadenceNote({ cadence: "annual" })).toBe("annual, spread");
    expect(cadenceNote({ cadence: "usage" })).toBe("usage, 3-month average");
    expect(cadenceNote({ cadence: "monthly" })).toBeNull();
  });
});

describe("filters on the Spend page", () => {
  const sub = (vendor: string) => SPEND.subscriptions.find((s) => s.vendor === vendor && s.verified)!;

  it("filtered bars sum to the filtered headline, with pending calls applied after the filter", () => {
    const f = { project: ["octocat/ledger-api"], inbox: [] };
    const v = viewSpend(filterSpend(SPEND, f), {});
    expect(v.workCents).toBe(4000 + 2600);
    expect(v.work.reduce((a, s) => a + (s.monthlyCents ?? 0), 0)).toBe(v.workCents);
    const moved = viewSpend(filterSpend(SPEND, f), { sentry: "personal" });
    expect(moved.workCents).toBe(4000);
    expect(moved.personal.map((s) => s.vendor)).toEqual(["Sentry"]);
  });

  it("chip totals follow the other row's pick and the user's pending calls", () => {
    const all = viewFacets(SPEND, {});
    expect(all.projects.find((p) => p.key === "octocat/ledger-api")?.monthlyCents).toBe(6600);
    const inYou = viewFacets(SPEND, {}, { project: [], inbox: ["you@example.com"] });
    // Sentry arrives at billing@ only, so within you@ the repo is just Vercel.
    expect(inYou.projects.find((p) => p.key === "octocat/ledger-api")?.monthlyCents).toBe(4000);
    // Every chip stays, even at zero, and says when it would match nothing.
    expect(inYou.projects.map((p) => p.key)).toEqual(all.projects.map((p) => p.key));
    expect(inYou.projects.find((p) => p.key === "octocat/billing-web")?.lines).toBe(0);
    expect(inYou.projects.find((p) => p.key === "hubot/notify-cli")?.lines).toBe(2);
    const personal = viewFacets(SPEND, { sentry: "personal" });
    expect(personal.projects.find((p) => p.key === "octocat/ledger-api")?.monthlyCents).toBe(4000);
  });

  it("a row's trailer names repos and the addresses worth naming, minus what the filter says", () => {
    const vercel = sub("Vercel");
    const none = { project: [], inbox: [] };
    // The main inbox is left out unfiltered; the second one is news.
    expect(rowTrailer(vercel, none, ["you@example.com"])).toEqual(["octocat/ledger-api", "octocat/edge-proxy", "billing@example.com"]);
    expect(rowTrailer(sub("Anthropic"), none, ["you@example.com"])).toEqual([]);
    // With an address picked, the other one reads "also".
    expect(rowTrailer(vercel, { project: ["octocat/ledger-api"], inbox: ["billing@example.com"] }, ["you@example.com"])).toEqual([
      "octocat/edge-proxy",
      "also you@example.com",
    ]);
    expect(rowTrailer(vercel, none, ["you@example.com", "billing@example.com"], repoLabeler(["octocat/ledger-api", "octocat/edge-proxy"]))).toEqual([
      "ledger-api",
      "edge-proxy",
    ]);
  });

  it("short repo names unless two owners share one", () => {
    const label = repoLabeler(["octocat/api", "hubot/api", "hubot/notify-cli"]);
    expect(label("hubot/notify-cli")).toBe("notify-cli");
    expect(label("octocat/api")).toBe("octocat/api");
  });
});
