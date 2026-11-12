/**
 * Development-only Projects and Activity fixtures, in exactly the API's shapes.
 * Obviously fake: GitHub logins "octocat" and "hubot", hosts at example.com, inboxes
 * at example.com. Every health state and every notice kind appears at least once.
 */
import type { ActivityReport, Deployment, Notice, Project, ProjectsReport, UnlinkedSubscription } from "@/app/app/project-model";
import { billingUrl } from "@/lib/findings-rules";
import { providerOf } from "@/lib/hosts";
import { moveHome, productionHost } from "@/lib/move-home";
import { NOW } from "./fixtures";

const H = 3_600_000;
const D = 24 * H;
const at = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

const YOU = "you@example.com";
const BILLING = "billing@example.com";

function notice(id: string, over: Partial<Notice> & Pick<Notice, "kind" | "vendor">): Notice {
  return {
    id,
    subject: null,
    inbox: YOU,
    at: at(D),
    amountCents: null,
    currency: "USD",
    dueAt: null,
    projectNames: [],
    domainNames: [],
    verified: true,
    plan: null,
    vendorUrl: billingUrl(over.vendor),
    ...over,
  };
}

const dep = (environment: string, state: string, url: string, atIso: string): Deployment => ({ environment, state, url, at: atIso, provider: providerOf(url, null) });

const N = {
  vercelFail: notice("rcpt_d01", {
    kind: "deployment",
    vendor: "Vercel",
    subject: "Failed production deployment on octocat/ledger-api",
    at: at(2 * H),
    projectNames: ["ledger-api"],
  }),
  netlifyFail: notice("rcpt_d02", {
    kind: "deployment",
    vendor: "Netlify",
    subject: "Deploy failed for docs-site",
    at: at(1 * D + 3 * H),
    projectNames: ["docs-site"],
    inbox: BILLING,
  }),
  supabasePay: notice("rcpt_p01", {
    kind: "payment_failed",
    vendor: "Supabase",
    subject: "Your payment for Supabase Pro failed",
    at: at(3 * D),
    amountCents: 2500,
    plan: "Pro",
    projectNames: ["billing-web"],
  }),
  incident: notice("rcpt_i01", {
    kind: "incident_alert",
    vendor: "Render",
    subject: "Degraded performance in Oregon",
    at: at(5 * H),
    projectNames: ["queue-worker"],
  }),
  security: notice("rcpt_s01", {
    kind: "account_security",
    vendor: "GitHub",
    subject: "A personal access token was used from a new location",
    at: at(1 * D + 9 * H),
  }),
  deprecation: notice("rcpt_x01", {
    kind: "deprecation_notice",
    vendor: "Vercel",
    subject: "Node.js 18 is reaching end of life on your projects",
    at: at(6 * D),
    projectNames: ["edge-proxy"],
  }),
  renewal: notice("rcpt_r01", {
    kind: "renewal_notice",
    vendor: "Namecheap",
    subject: "Your domain example.com renews soon",
    at: at(2 * D),
    dueAt: ahead(18 * D),
    amountCents: 7000,
    domainNames: ["example.com"],
  }),
  trial: notice("rcpt_t01", {
    kind: "trial_notice",
    vendor: "Resend",
    subject: "Your Resend Pro trial ends soon",
    vendorUrl: "https://resend.com/settings/billing",
    at: at(4 * D),
    dueAt: ahead(6 * D),
  }),
  dns: notice("rcpt_n01", {
    kind: "domain_or_dns",
    vendor: "Cloudflare",
    subject: "DNS record added for status.example.com",
    at: at(9 * D),
    domainNames: ["status.example.com"],
    projectNames: ["status-site"],
  }),
  plan: notice("rcpt_c01", {
    kind: "plan_change",
    vendor: "Railway",
    subject: "You moved to the Hobby plan",
    at: at(12 * D),
    projectNames: ["notify-cli"],
  }),
  rVercel: notice("rcpt_b01", { kind: "receipt", vendor: "Vercel", subject: "Your Vercel receipt", at: at(6 * H), amountCents: 2000, plan: "Pro" }),
  rSupabase: notice("rcpt_b02", { kind: "receipt", vendor: "Supabase", subject: "Supabase invoice", at: at(1 * D + 2 * H), amountCents: 2500, inbox: BILLING, plan: "Pro" }),
  rGithub: notice("rcpt_b03", { kind: "receipt", vendor: "GitHub", subject: "Your GitHub receipt", at: at(3 * D + 4 * H), amountCents: 400, plan: "Pro" }),
  rFly: notice("rcpt_b04", { kind: "receipt", vendor: "Fly.io", subject: "Fly.io invoice", at: at(8 * D), amountCents: 1137, inbox: BILLING }),
  rFake: notice("rcpt_b05", {
    kind: "receipt",
    vendor: "Vercel",
    subject: "Action needed: update your billing",
    at: at(2 * D + 5 * H),
    amountCents: 9900,
    verified: false,
  }),
};

function project(id: string, name: string, over: Partial<Project>): Project {
  const p: Project = {
    id,
    name,
    url: `https://github.com/${name}`,
    private: true,
    defaultBranch: "main",
    status: "active",
    lastPushAt: at(2 * D),
    health: "ok",
    deployments: [],
    monthlyCents: null,
    currency: null,
    subscriptions: [],
    notices: [],
    openFindings: [],
    ...over,
  };
  const host = productionHost(p.deployments)?.host ?? p.deployments.find((d) => d.environment.toLowerCase() === "production" && d.provider)?.provider ?? null;
  const move = moveHome({ host, repoFullName: p.name, repoUrl: p.url });
  return { ...p, elsewhere: move ? { host: move.host, importUrl: move.importUrl, guideUrl: move.guide?.url ?? null, guideTitle: move.guide?.title ?? null } : null };
}

const sub = (id: string, vendor: string, plan: string | null, cents: number | null, inbox = YOU) => ({
  id,
  vendor,
  plan,
  monthlyCents: cents,
  currency: "USD",
  inbox,
});

const PROJECTS: Project[] = [
  project("p01", "octocat/ledger-api", {
    health: "failed",
    lastPushAt: at(3 * H),
    deployments: [
      dep("production", "failure", "https://ledger-api.vercel.app", at(2 * H)),
      dep("preview", "success", "https://ledger-api-git-main.vercel.app", at(3 * H)),
    ],
    monthlyCents: 2000,
    currency: "USD",
    subscriptions: [sub("s-vercel", "Vercel", "Pro", 2000)],
    notices: [N.vercelFail, N.rVercel],
  }),
  project("p02", "hubot/docs-site", {
    health: "failed",
    private: false,
    lastPushAt: at(1 * D + 4 * H),
    notices: [N.netlifyFail],
  }),
  project("p03", "octocat/billing-web", {
    health: "attention",
    lastPushAt: at(5 * D),
    deployments: [dep("production", "success", "https://billing.example.com", at(5 * D))],
    monthlyCents: 2500,
    currency: "USD",
    subscriptions: [sub("s-supa", "Supabase", "Pro", 2500, BILLING)],
    notices: [N.supabasePay, N.rSupabase],
    openFindings: [{ id: "f2", kind: "duplicate_plan", title: "Supabase Pro is billed to two inboxes", amountCents: 2500 }],
  }),
  project("p04", "octocat/queue-worker", {
    health: "attention",
    lastPushAt: at(9 * D),
    deployments: [dep("production", "success", "https://queue-worker.onrender.com", at(9 * D))],
    monthlyCents: 1137,
    currency: "USD",
    subscriptions: [sub("s-render", "Render", "Starter", 1137, BILLING)],
    notices: [N.incident],
  }),
  project("p05", "octocat/edge-proxy", {
    lastPushAt: at(20 * H),
    deployments: [
      dep("production", "success", "https://edge.example.com", at(20 * H)),
      dep("staging", "in_progress", "https://edge-staging.vercel.app", at(25 * 60_000)),
    ],
    monthlyCents: 2000,
    currency: "USD",
    subscriptions: [sub("s-vercel2", "Vercel", "Pro", 2000)],
    notices: [N.deprecation],
  }),
  project("p06", "hubot/status-site", {
    private: false,
    lastPushAt: at(4 * D),
    deployments: [dep("production", "success", "https://status-site.pages.dev", at(4 * D))],
    notices: [N.dns],
  }),
  project("p07", "hubot/notify-cli", {
    lastPushAt: at(11 * D),
    monthlyCents: 500,
    currency: "USD",
    subscriptions: [sub("s-railway", "Railway", "Hobby", 500)],
    notices: [N.plan],
  }),
  project("p08", "octocat/search-api", {
    lastPushAt: at(26 * D),
    deployments: [dep("production", "success", "https://search.example.com", at(26 * D))],
  }),
  project("p09", "octocat/metrics-jobs", { health: "unknown", lastPushAt: null }),
  project("p10", "octocat/media-sdk", { health: "idle", lastPushAt: at(142 * D) }),
  project("p11", "hubot/export-service", {
    health: "idle",
    lastPushAt: at(210 * D),
    deployments: [dep("production", "inactive", "https://export-service.fly.dev", at(210 * D))],
    monthlyCents: 700,
    currency: "USD",
    subscriptions: [sub("s-fly", "Fly.io", null, 700, BILLING)],
    openFindings: [{ id: "f1", kind: "zombie", title: "Fly.io: hubot/export-service, no push in 210 days", amountCents: 700 }],
  }),
  project("p12", "octocat/cache-proxy", { health: "idle", lastPushAt: at(388 * D), private: false }),
  project("p13", "octocat/auth-web", { health: "archived", status: "archived", lastPushAt: at(600 * D) }),
  project("p14", "hubot/graph-cli", { health: "archived", status: "archived", lastPushAt: at(730 * D), private: false }),
];

const UNLINKED: UnlinkedSubscription[] = [
  { ...sub("u1", "GitHub", "Copilot", 1000), cadence: "monthly", lastBilledAt: at(3 * D), nextExpectedAt: ahead(27 * D), receipts: 8, verified: true },
  { ...sub("u2", "Namecheap", null, 583), cadence: "annual", lastBilledAt: at(300 * D), nextExpectedAt: ahead(18 * D), receipts: 3, verified: true },
  { ...sub("u3", "Sentry", "Team", null, BILLING), cadence: "unknown", lastBilledAt: at(4 * D), nextExpectedAt: null, receipts: 1, verified: true },
  { ...sub("u4", "Vercel", "Pro", 9900), cadence: "monthly", lastBilledAt: at(2 * D), nextExpectedAt: null, receipts: 1, verified: false },
];

const totals = (projects: Project[], monthlyCents: number) => ({
  projects: projects.length,
  failed: projects.filter((p) => p.health === "failed").length,
  attention: projects.filter((p) => p.health === "attention").length,
  monthlyCents,
  quietMonthlyCents: projects.filter((p) => p.health === "idle" || p.health === "archived").reduce((a, p) => a + (p.monthlyCents ?? 0), 0),
  currency: "USD",
});

/** Everything: both GitHub accounts, both inboxes, every health state. */
export const PROJECTS_FULL: ProjectsReport = {
  projects: PROJECTS,
  unlinked: UNLINKED,
  totals: totals(PROJECTS, 2000 + 2500 + 1137 + 2000 + 500 + 700 + 1000 + 583),
};

/** GitHub only: repos and deploys, no mail yet, so no bills or notices. */
const bare = PROJECTS.map((p) => {
  const failedDeploy = p.deployments.some((d) => d.state === "failure");
  const health = p.health === "failed" && !failedDeploy ? "ok" : p.health === "attention" ? "ok" : p.health;
  return { ...p, health, monthlyCents: null, currency: null, subscriptions: [], notices: [], openFindings: [] } satisfies Project;
});
export const PROJECTS_GITHUB_ONLY: ProjectsReport = { projects: bare, unlinked: [], totals: totals(bare, 0) };

export const PROJECTS_NONE: ProjectsReport = { projects: [], unlinked: [], totals: totals([], 0) };

/** A calm account: nothing failing, nothing flagged. */
const calm = PROJECTS.filter((p) => p.health === "ok" || p.health === "idle" || p.health === "archived");
export const PROJECTS_CALM: ProjectsReport = { projects: calm, unlinked: UNLINKED.slice(0, 2), totals: totals(calm, 4083) };

const ITEMS: Notice[] = Object.values(N).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

export const ACTIVITY_FULL: ActivityReport = {
  items: ITEMS,
  failedDeployments: [
    { id: "dep1", name: "octocat/ledger-api (production)", environment: "production", url: "https://ledger-api.vercel.app", state: "failure", at: at(2 * H + 4 * 60_000), provider: "Vercel" },
    { id: "dep2", name: "octocat/search-api (preview)", environment: "preview", url: null, state: "error", at: at(15 * D), provider: null },
  ],
};

export const ACTIVITY_GITHUB_ONLY: ActivityReport = { items: [], failedDeployments: ACTIVITY_FULL.failedDeployments.slice(0, 1) };
export const ACTIVITY_NONE: ActivityReport = { items: [], failedDeployments: [] };
