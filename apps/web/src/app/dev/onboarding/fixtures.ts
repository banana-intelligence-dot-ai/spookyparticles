/**
 * Development-only fixtures for the Setup and Connections preview. Obviously fake:
 * GitHub logins like "octocat", inboxes at example.com. Never real accounts.
 */
import type { VendorsReport } from "@/app/app/billing-mail";
import type { Connection, Sync } from "@/app/app/connection-model";

const T0 = "2026-11-02T15:00:00.000Z";
const T1 = "2026-11-02T15:04:12.000Z";
/** The preview's fixed "now", so relative dates render the same on server and client. */
export const NOW = Date.parse("2026-11-02T18:00:00.000Z");
const ago = (days: number, hours = 0) => new Date(NOW - (days * 24 + hours) * 3600_000).toISOString();

function sync(over: Partial<Sync>): Sync {
  return {
    id: "sync-fixture",
    phase: "done",
    scanned: 0,
    candidates: 0,
    error: null,
    paused: false,
    startedAt: T0,
    finishedAt: T1,
    totalEstimate: null,
    remaining: null,
    etaSeconds: null,
    percent: null,
    ...over,
  };
}

function conn(id: string, provider: Connection["provider"], display: string, over: Partial<Connection> = {}): Connection {
  return {
    id,
    provider,
    display,
    status: "active",
    statusReason: null,
    scopes: [],
    createdAt: T0,
    lastSyncedAt: T1,
    sync: null,
    ...over,
  };
}

const ghDone = (id: string, login: string, repos: number) =>
  conn(id, "github", login, { sync: sync({ phase: "done", scanned: repos }) });
const gmDone = (id: string, inbox: string, scanned: number, candidates: number) =>
  conn(id, "gmail", inbox, { sync: sync({ phase: "done", scanned, candidates }) });

const NO_MAIL: VendorsReport = { vendors: [], unmatched: 0, messages: 0, inboxes: 0 };

const EARLY_MAIL: VendorsReport = {
  vendors: [
    { vendor: "Vercel", category: "hosting", messages: 9, inboxes: 1, firstAt: ago(200), lastAt: ago(0, 5) },
    { vendor: "GitHub", category: "dev_tools", messages: 6, inboxes: 1, firstAt: ago(300), lastAt: ago(3) },
    { vendor: "Supabase", category: "database", messages: 4, inboxes: 1, firstAt: ago(120), lastAt: ago(11) },
  ],
  unmatched: 7,
  messages: 1240,
  inboxes: 1,
};

const FULL_MAIL: VendorsReport = {
  vendors: [
    { vendor: "Vercel", category: "hosting", messages: 41, inboxes: 2, firstAt: ago(400), lastAt: ago(0, 5) },
    { vendor: "GitHub", category: "dev_tools", messages: 28, inboxes: 2, firstAt: ago(700), lastAt: ago(3) },
    { vendor: "Supabase", category: "database", messages: 19, inboxes: 1, firstAt: ago(300), lastAt: ago(11) },
    { vendor: "Cloudflare", category: "dns_cdn", messages: 14, inboxes: 1, firstAt: ago(500), lastAt: ago(18) },
    { vendor: "OpenAI", category: "ai", messages: 12, inboxes: 1, firstAt: ago(260), lastAt: ago(2) },
    { vendor: "Namecheap", category: "domains", messages: 6, inboxes: 1, firstAt: ago(900), lastAt: ago(64) },
    { vendor: "Stripe", category: "payments_processor", messages: 3, inboxes: 1, firstAt: ago(90), lastAt: ago(40) },
  ],
  unmatched: 23,
  messages: 10722,
  inboxes: 2,
};

export const FIXTURES: { key: string; title: string; note: string; list: Connection[]; mail: VendorsReport }[] = [
  {
    key: "empty",
    title: "First visit",
    note: "Nothing connected yet.",
    list: [],
    mail: NO_MAIL,
  },
  {
    key: "github-only",
    title: "GitHub connected, syncing",
    note: "GitHub install running its first sync; Gmail not connected.",
    list: [conn("g1", "github", "octocat", { lastSyncedAt: null, sync: sync({ phase: "search", scanned: 14, finishedAt: null }) })],
    mail: NO_MAIL,
  },
  {
    key: "syncing",
    title: "Both connected, Gmail syncing",
    note: "GitHub done; Gmail first sync in progress.",
    list: [
      ghDone("g1", "octocat", 23),
      conn("m1", "gmail", "you@example.com", {
        lastSyncedAt: null,
        sync: sync({ phase: "search", scanned: 1240, candidates: 37, finishedAt: null, reading: { done: 12, total: 26 } }),
      }),
    ],
    mail: EARLY_MAIL,
  },
  {
    key: "full-scan",
    title: "Gmail full scan with an estimate",
    note: "Search phase done; exhaustive scan running with a known total and ETA.",
    list: [
      ghDone("g1", "octocat", 23),
      conn("m1", "gmail", "you@example.com", {
        lastSyncedAt: null,
        sync: sync({
          phase: "exhaustive",
          scanned: 12400,
          candidates: 296,
          finishedAt: null,
          totalEstimate: 58000,
          remaining: 45600,
          etaSeconds: 912,
          percent: 21,
          reading: { done: 98, total: 146 },
        }),
      }),
    ],
    mail: { ...FULL_MAIL, inboxes: 1 },
  },
  {
    key: "errored",
    title: "Gmail access expired",
    note: "Weekly while the Google app is in Testing status.",
    list: [
      ghDone("g1", "octocat", 23),
      conn("m1", "gmail", "you@example.com", {
        status: "errored",
        statusReason: "Google access expired. Reconnect this inbox.",
        sync: sync({ phase: "done", scanned: 8412, candidates: 211 }),
      }),
    ],
    mail: FULL_MAIL,
  },
  {
    key: "done",
    title: "Done (what tenant zero sees today)",
    note: "One GitHub install, two inboxes, all synced.",
    list: [
      ghDone("g1", "octocat", 23),
      gmDone("m1", "you@example.com", 8412, 211),
      gmDone("m2", "billing@example.com", 2310, 96),
    ],
    mail: FULL_MAIL,
  },
  {
    key: "done-expired",
    title: "Done, one inbox expired",
    note: "Tenant zero's weekly case: setup finished, then Google access lapsed on one inbox.",
    list: [
      ghDone("g1", "octocat", 23),
      gmDone("m1", "you@example.com", 8412, 211),
      conn("m2", "gmail", "billing@example.com", {
        status: "errored",
        statusReason: "Google access expired. Reconnect this inbox.",
        sync: sync({ phase: "done", scanned: 2310, candidates: 96 }),
      }),
    ],
    mail: FULL_MAIL,
  },
  {
    key: "many",
    title: "Several accounts, orgs and inboxes",
    note: "Mixed states across providers.",
    list: [
      ghDone("g1", "octocat", 23),
      ghDone("g2", "hubot", 4),
      ghDone("g3", "example-org", 118),
      conn("g4", "github", "example-labs", {
        status: "errored",
        statusReason: "Installation suspended on GitHub",
        sync: sync({ phase: "done", scanned: 9 }),
      }),
      gmDone("m1", "you@example.com", 8412, 211),
      conn("m2", "gmail", "billing@example.com", {
        lastSyncedAt: null,
        sync: sync({
          phase: "exhaustive",
          scanned: 18204,
          candidates: 402,
          finishedAt: null,
          totalEstimate: 24000,
          remaining: 5796,
          etaSeconds: 3900,
          percent: 75,
        }),
      }),
      conn("m3", "gmail", "ops@example.com", {
        status: "errored",
        statusReason: "Google access expired. Reconnect this inbox.",
        sync: sync({ phase: "done", scanned: 512, candidates: 8 }),
      }),
      conn("m4", "gmail", "old@example.com", { status: "revoked", sync: sync({ phase: "done", scanned: 90, candidates: 2 }) }),
    ],
    mail: { ...FULL_MAIL, inboxes: 3 },
  },
];
