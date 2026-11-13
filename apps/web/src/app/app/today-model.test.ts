import { describe, expect, it } from "vitest";
import { FIXTURES, NOW } from "../dev/onboarding/fixtures";
import { ACTIVITY_FULL, PROJECTS_CALM, PROJECTS_FULL } from "../dev/onboarding/project-fixtures";
import { FINDINGS, SPEND } from "../dev/onboarding/spend-fixtures";
import { buildToday, fixPrompt } from "./today-model";

const conns = FIXTURES.find((f) => f.key === "done-expired")!.list;
const full = buildToday({ projects: PROJECTS_FULL.projects, findings: FINDINGS, spend: SPEND, notices: ACTIVITY_FULL.items, connections: conns, now: NOW });

describe("buildToday", () => {
  it("adds one Check row when verified findings are open", () => {
    const today = buildToday({ projects: [], findings: [], spend: null, notices: [], connections: [], checkOpen: 2, now: NOW });
    expect(today.rows).toMatchObject([{ what: "2 findings open", action: { href: "/app/check" } }]);
  });
  it("caps the list at ten and ranks red, then amber, then grey", () => {
    expect(full.rows.length).toBeLessThanOrEqual(10);
    const order = full.rows.map((r) => r.tone);
    const rank = { red: 0, amber: 1, grey: 2 };
    expect(order.map((t) => rank[t])).toEqual([...order.map((t) => rank[t])].sort((a, b) => a - b));
  });

  it("counts failed deploys from GitHub and mail, and the card that bounced, as broken", () => {
    const red = full.rows.filter((r) => r.tone === "red");
    expect(red.some((r) => r.what.startsWith("ledger-api: production deploy failed"))).toBe(true);
    expect(red.some((r) => r.what.startsWith("docs-site"))).toBe(true);
    // The Supabase card shows once: the finding wins over the notice.
    expect(red.filter((r) => /Supabase/.test(r.what))).toHaveLength(1);
    expect(full.broken).toBe(red.length);
  });

  it("names a source on every row and links an action", () => {
    for (const r of full.rows) {
      expect(r.source.length).toBeGreaterThan(0);
    }
    expect(full.rows.filter((r) => r.action).length).toBeGreaterThan(0);
  });

  it("puts a stopped inbox in the needs-you rows and a later renewal below them", () => {
    expect(full.rows.some((r) => r.tone === "amber" && /stopped syncing/.test(r.what))).toBe(true);
    // Due in 18 days: worth a look, not this week.
    expect(full.rows.find((r) => /example\.com renews in 18\sdays/.test(r.what))?.tone).toBe("grey");
    expect(full.needsWeek).toBe(full.rows.filter((r) => r.tone === "amber").length);
  });

  it("leaves a deploy that failed months ago off the broken count", () => {
    const calm = buildToday({ projects: PROJECTS_CALM.projects, findings: [], spend: null, notices: [], connections: [], now: NOW });
    expect(calm.broken).toBe(0);
  });
});

describe("the host's later success closes a failure", () => {
  it("drops a failed deploy and a failure email once the same project deployed successfully after them", () => {
    const ledger = PROJECTS_FULL.projects.find((p) => p.name.endsWith("ledger-api"))!;
    const failedAt = ledger.deployments.find((d) => d.state === "failure" || d.state === "error")?.at ?? null;
    expect(failedAt).not.toBeNull();
    const later = new Date(Date.parse(failedAt!) + 3_600_000).toISOString();
    const healed = {
      ...ledger,
      deployments: [...ledger.deployments, { environment: "production", state: "success", url: "https://ledger-api.example.com", at: later, provider: "Vercel" }],
    };
    const today = buildToday({ projects: [healed], findings: [], spend: null, notices: ACTIVITY_FULL.items, connections: conns, now: NOW });
    expect(today.rows.some((r) => r.what.startsWith("ledger-api: production deploy failed"))).toBe(false);
  });

  it("hands a failed deploy to the agent with the evidence, and drops it once ignored", () => {
    const ledger = PROJECTS_FULL.projects.find((p) => p.name.endsWith("ledger-api"))!;
    const keyed = { ...ledger, notices: [], deployments: ledger.deployments.map((d) => (d.state === "failure" || d.state === "error" ? { ...d, key: "dep1@t" } : d)) };
    const row = buildToday({ projects: [keyed], findings: [], spend: null, notices: [], connections: conns, now: NOW }).rows.find((r) => r.what.startsWith("ledger-api: production deploy failed"))!;
    expect(row.fix?.ignoreKey).toBe("dep1@t");
    expect(row.fix?.prompt).toMatch(/ledger-api is broken/);
    expect(row.fix?.prompt).toMatch(/confirm_fix/);
    expect(row.fix?.prompt).toMatch(/ignore it in Spooky/);
    const ignored = { ...keyed, deployments: keyed.deployments.map((d) => (d.key ? { ...d, ignored: true } : d)) };
    const today = buildToday({ projects: [ignored], findings: [], spend: null, notices: [], connections: conns, now: NOW });
    expect(today.rows.some((r) => r.what.startsWith("ledger-api: production deploy failed"))).toBe(false);
  });

  it("writes a fix prompt with no em dashes and the project's confirm link", () => {
    const text = fixPrompt({ project: "acme/mmlp", environment: "CI", at: "2026-10-24T03:53:24.000Z", host: "GitHub", cause: "Axios advisory", link: "https://github.com/acme/mmlp/actions/runs/1" });
    expect(text).toContain("the CI deploy on GitHub failed on 2026-10-24 03:53 UTC");
    expect(text).toContain("project=acme%2Fmmlp&format=text");
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("keeps the failure when the only later success is in another environment", () => {
    const ledger = PROJECTS_FULL.projects.find((p) => p.name.endsWith("ledger-api"))!;
    const failedAt = ledger.deployments.find((d) => d.state === "failure" || d.state === "error")!.at!;
    const later = new Date(Date.parse(failedAt) + 3_600_000).toISOString();
    const previewOnly = { ...ledger, notices: [], deployments: [...ledger.deployments, { environment: "preview", state: "success", url: null, at: later, provider: "Vercel" }] };
    const today = buildToday({ projects: [previewOnly], findings: [], spend: null, notices: [], connections: conns, now: NOW });
    expect(today.rows.some((r) => r.what.startsWith("ledger-api: production deploy failed"))).toBe(true);
  });
});
