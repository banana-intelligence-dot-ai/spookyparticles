/**
 * Fixtures for the Check screen. Built through the real report function, so the
 * preview shows the same words production does. Names are obviously fake.
 */
import type { schema } from "@/db";
import type { CheckReport } from "@/app/app/check/check-view";
import { checkReport } from "@/lib/checks/report";
import { billRows, serviceRows } from "@/lib/services/model";
import { NOW } from "./fixtures";

type Node = typeof schema.nodes.$inferSelect;
type Row = typeof schema.projectChecks.$inferSelect;
type Attempt = typeof schema.checkAttempts.$inferSelect;
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000);

const node = (id: string, name: string, repo: string | null = `you/${name}`): Node =>
  ({ id, userId: "u", kind: "project", externalKey: `vercel:project:${id}`, name, attributes: { scope_slug: "your-team", production_url: `https://${name}.example.com`, repo, repo_provider: repo ? "github" : null } }) as unknown as Node;

let n = 0;
const row = (nodeId: string, check: string, state: string, more: Partial<Row> = {}): Row =>
  ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, userId: "u", nodeId, check, state, reason: null, source: "verified", evidence: {}, firstOpenAt: state === "open" ? at(600) : null, fixedAt: null, dismissedAt: null, dismissedBy: null, checkedAt: at(4), ...more }) as Row;

const NODES = [node("a", "storefront"), node("b", "booking-app"), node("c", "landing"), node("d", "internal-tools"), node("e", "side-project", null), node("f", "agent-examples"), node("g", "three-tries")];

const ROWS: Row[] = [
  // storefront: two open, one of them the serious kind
  row("a", "previews_open", "ok"),
  row("a", "secret_not_sensitive", "open", { evidence: { names: ["DATABASE_URL", "STRIPE_SECRET_KEY"], plain: 0, readable: 2 } }),
  row("a", "secret_in_public_code", "open", { evidence: { kind: "found", hits: [{ kind: "found", pattern: "Stripe live secret key", path: "/_next/static/chunks/app/checkout/page-3f9a1c.js" }], deploymentId: "dpl_1" } }),
  row("a", "cron_unguarded", "ok", { evidence: { paths: ["/api/cron/sync"] } }),
  row("a", "deps_not_updated", "ok", { fixedAt: at(2000), firstOpenAt: at(9000), evidence: { files: [".github/dependabot.yml"] } }),
  // booking-app: previews open, schedule unguarded, one dismissed
  row("b", "previews_open", "open"),
  row("b", "secret_not_sensitive", "ok"),
  row("b", "secret_in_public_code", "ok", { evidence: { hits: [], deploymentId: "dpl_2" } }),
  row("b", "cron_unguarded", "open", { evidence: { paths: ["/api/cron/reminders", "/api/cron/cleanup"] } }),
  row("b", "deps_not_updated", "open", { dismissedAt: at(300), dismissedBy: "you", evidence: { files: [] } }),
  // landing: all clear
  row("c", "previews_open", "ok"),
  row("c", "secret_not_sensitive", "ok"),
  row("c", "secret_in_public_code", "ok", { evidence: { hits: [], deploymentId: "dpl_3" } }),
  row("c", "cron_unguarded", "not_applicable", { reason: "no_schedules" }),
  row("c", "deps_not_updated", "ok", { evidence: { files: ["renovate.json"] } }),
  // internal-tools: connected through the integration only, protected site, private repo
  row("d", "previews_open", "ok"),
  row("d", "secret_not_sensitive", "unknown", { reason: "needs_read_token" }),
  row("d", "secret_in_public_code", "unknown", { reason: "site_protected" }),
  row("d", "cron_unguarded", "unknown", { reason: "needs_read_token" }),
  row("d", "deps_not_updated", "unknown", { reason: "private_repo" }),
  // side-project: nothing checked yet beyond settings
  row("e", "previews_open", "ok"),
  row("e", "secret_not_sensitive", "ok"),
  row("e", "cron_unguarded", "not_applicable", { reason: "no_schedules" }),
  row("e", "deps_not_updated", "not_applicable", { reason: "no_repo" }),
  row("f", "secret_in_public_code", "open"),
  row("f", "previews_open", "open"),
  row("f", "cron_unguarded", "open"),
  row("f", "secret_not_sensitive", "open"),
  row("f", "deps_not_updated", "open"),
  row("g", "deps_not_updated", "open"),
];

const exampleRows = ROWS.filter((r) => r.nodeId === "f");
const attempt = (checkId: string, minutesAgo: number, outcome: Attempt["outcome"], more: Partial<Attempt> = {}): Attempt =>
  ({ id: crypto.randomUUID(), userId: "u", checkId, actor: "api_key:example", takenAt: at(minutesAgo), outcome, prUrl: null, note: null, reportedAt: outcome ? at(minutesAgo - 1) : null, ...more }) as Attempt;
// Each example pairs a check with an outcome the API would accept for it.
const example = (check: string) => exampleRows.find((r) => r.check === check)!.id;
const ATTEMPTS = [
  attempt(example("secret_in_public_code"), 15, null),
  attempt(example("cron_unguarded"), 30, "pr_opened", { prUrl: "https://github.com/you/agent-examples/pull/123" }),
  attempt(example("previews_open"), 60, "told_person"),
  attempt(example("secret_not_sensitive"), 90, "could_not_fix", { note: "Only you can turn on Sensitive. I listed the two variables in the pull request." }),
  attempt(example("deps_not_updated"), 120, "not_a_problem", { note: "The repo already runs Renovate from a shared config in another repo." }),
  attempt(ROWS.find((r) => r.nodeId === "g")!.id, 120, "could_not_fix"),
  attempt(ROWS.find((r) => r.nodeId === "g")!.id, 180, "could_not_fix"),
  attempt(ROWS.find((r) => r.nodeId === "g")!.id, 240, "could_not_fix"),
];

const json = (r: ReturnType<typeof checkReport>): CheckReport => JSON.parse(JSON.stringify(r));

export const CHECK_FULL = json(checkReport(NODES, ROWS, true, ATTEMPTS, new Date(NOW)));
export const CHECK_CLEAR = json(checkReport(NODES.slice(2), ROWS.filter((r) => ["c", "d", "e"].includes(r.nodeId)), true));
export const CHECK_NONE = json(checkReport([], [], true));
export const CHECK_NOT_READY = json(checkReport(NODES, [], false));

/** The Services section, built through the real rows function. Names and amounts are obviously fake. */
const svc = (id: string, name: string, category: string, cents: number | null, costs?: Record<string, unknown>) =>
  ({ id, name, externalKey: `service:${name.toLowerCase()}`, attributes: { category, ...(costs ? { costs } : {}) }, monthlyCostCents: cents });
const proj = (id: string, name: string, paused = false) => ({ id, name, externalKey: `vercel:project:prj_${id}`, status: paused ? "paused" : "live", attributes: { scope_slug: "you", paused, errorRate: { incidentAt: null, recoveryWindows: 0, readSince: new Date(NOW - 40 * 86_400_000).toISOString(), lastTrafficAt: id === "b" ? new Date(NOW - 3_600_000).toISOString() : null } } });
const use = (from: string, to: string, source = "vercel", call?: string) => ({ fromNodeId: from, toNodeId: to, provenance: { source, call }, lastSeenAt: new Date(NOW) });
const billed = { vercel_billing: { cents: 1900, from: new Date(NOW - 31 * 86_400_000).toISOString(), to: new Date(NOW - 86_400_000).toISOString(), at: new Date(NOW).toISOString(), scopes: { "team:sample": 1900 } } };
const period = { from: new Date(NOW - 31 * 86_400_000).toISOString(), to: new Date(NOW - 86_400_000).toISOString() };
const billOf = (cents: number, products: [string, number][]) => ({ cents, products: products.map(([name, c]) => ({ name, cents: c })), from: period.from });
const BILL_SAMPLE = billRows(
  [proj("a", "storefront"), proj("b", "blog"), proj("c", "old-demo", true)].map((p, i) => ({ ...p, attributes: { ...p.attributes, scope_id: "sample",
    vercel_bill: [billOf(3420, [["Neon Postgres", 1900], ["Function Invocations", 1210], ["Fast Data Transfer", 310]]), billOf(140, [["Fast Data Transfer", 140]]), billOf(0, [])][i] } })),
  [{ name: "you (Vercel)", externalKey: "vercel:account:sample", attributes: { billing: { state: "read", ...period, at: new Date(NOW).toISOString(), unassigned: billOf(2000, [["Pro Plan", 2000]]), chargedCents: 1450 } } }],
);
export const SERVICES_SAMPLE: ReturnType<typeof serviceRows> & { bill: typeof BILL_SAMPLE } = JSON.parse(JSON.stringify({ bill: BILL_SAMPLE, ...serviceRows(
  [svc("s1", "Neon", "database", 1900, billed), svc("s2", "Supabase", "database", null), svc("s3", "Stripe", "payments", 0), svc("s4", "Resend", "email", 2000, { you: { cents: 2000, at: new Date(NOW).toISOString() } }), svc("s5", "Sentry", "monitoring", null)],
  [proj("a", "storefront"), proj("b", "blog"), proj("c", "old-demo", true)],
  [use("a", "s1", "vercel", "GET /v1/billing/charges"), use("b", "s2"), use("c", "s2"), use("a", "s3", "manual"), use("b", "s4"), use("c", "s5")],
  { productionAt: new Map([["prj_a", new Date(NOW - 2 * 86_400_000).toISOString()], ["prj_b", new Date(NOW - 90 * 86_400_000).toISOString()]]), billingReadable: true, nowMs: NOW },
) }));
