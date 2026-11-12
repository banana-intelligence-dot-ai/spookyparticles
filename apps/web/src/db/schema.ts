/**
 * Database schema. Three groups:
 *
 * 1. Identity: the auth library's tables (user, session, account, verification).
 *    Identity is separate from connections; signing in never grants mailbox access.
 * 2. Connections: our own table for mailboxes and provider accounts, with our own
 *    OAuth flows and tokens encrypted by src/lib/crypto.ts.
 * 3. The graph (ARCHITECTURE section 3): nodes, edges with provenance and
 *    confidence, derived findings, the append-only audit log, API keys, analytics
 *    mirror, plus the Gmail backfill tables (messages, sync_runs).
 *
 * Rule: env var values and token plaintext never enter any table.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// 1. Identity (Better Auth). Column names follow its Drizzle adapter defaults.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

/** Sign-in identities only (scopes: email, profile). Not mailbox or provider access. */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    /** What a person recognizes this identity by: the Google email or GitHub login. Ours, not Better Auth's; null on rows made before it existed. */
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 2. Connections
// ---------------------------------------------------------------------------

export const connectionProvider = pgEnum("connection_provider", [
  "github",
  "gmail",
  "vercel",
  "supabase",
  "cloudflare",
]);

export const connectionStatus = pgEnum("connection_status", ["active", "revoked", "errored"]);

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: connectionProvider("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    /** Email address or login shown in the UI. */
    display: text("display").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    status: connectionStatus("status").notNull().default("active"),
    /** Short, token-free reason for an errored status, e.g. "installation suspended on GitHub". */
    statusReason: text("status_reason"),
    /**
     * AES-256-GCM envelope from src/lib/crypto.ts. Never logged, never returned by the API.
     * Always null for GitHub: installation tokens are minted on demand and never stored.
     */
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    /** Which master key encrypted the tokens, for rotation. */
    keyId: text("key_id"),
    createdAt: now("created_at"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("connections_user_id_idx").on(t.userId),
    // One live row per external account per user; reconnecting updates it.
    uniqueIndex("connections_user_provider_external_uq").on(
      t.userId,
      t.provider,
      t.externalAccountId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 3. Graph
// ---------------------------------------------------------------------------

export const nodeKind = pgEnum("node_kind", [
  "identity",
  "provider_account",
  "project",
  "deployment",
  "domain",
  "dns_record",
  "database",
  "service",
  "api_key",
  "subscription",
  "payment_method",
  "invoice",
  "repo",
]);

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: nodeKind("kind").notNull(),
    /** Stable key from the source, e.g. "github:repo:12345". Unique per user and kind. */
    externalKey: text("external_key").notNull(),
    name: text("name").notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    // Liveness
    status: text("status"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    // Cost
    monthlyCostCents: integer("monthly_cost_cents"),
    currency: text("currency"),
    createdAt: now("created_at"),
    lastSeenAt: now("last_seen_at"),
  },
  (t) => [
    uniqueIndex("nodes_user_kind_key_uq").on(t.userId, t.kind, t.externalKey),
    index("nodes_user_kind_idx").on(t.userId, t.kind),
  ],
);

/** Verified project checks. Evidence contains names and paths, never secret values. */
export const projectChecks = pgTable("project_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  nodeId: uuid("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  check: text("check").notNull(),
  state: text("state").notNull(),
  reason: text("reason"),
  source: text("source").notNull().default("verified"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  firstOpenAt: timestamp("first_open_at", { withTimezone: true }),
  fixedAt: timestamp("fixed_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedBy: text("dismissed_by"),
  checkedAt: now("checked_at"),
}, (t) => [
  uniqueIndex("project_checks_user_node_check_uq").on(t.userId, t.nodeId, t.check),
  index("project_checks_user_state_idx").on(t.userId, t.state),
]);

/** Agent handoffs are reports only. A later sweep alone verifies a fix. */
export const checkAttempts = pgTable("check_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  checkId: uuid("check_id").notNull().references(() => projectChecks.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  takenAt: now("taken_at"),
  outcome: text("outcome").$type<"pr_opened" | "told_person" | "could_not_fix" | "not_a_problem">(),
  prUrl: text("pr_url"),
  note: text("note"),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
}, (t) => [index("check_attempts_user_check_idx").on(t.userId, t.checkId)]);

export const edgeKind = pgEnum("edge_kind", [
  "owns",
  "pays_for",
  "deploys",
  "points_to",
  "uses",
  "billed_by",
  "hosted_on",
]);

export type Provenance = {
  source: "github" | "gmail" | "vercel" | "supabase" | "cloudflare" | "dns" | "manual";
  /** The API call or message that produced the fact, e.g. "GET /repos/{owner}/{repo}/deployments". */
  call?: string;
  messageId?: string;
  at: string;
};

export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    kind: edgeKind("kind").notNull(),
    confidence: real("confidence").notNull(),
    provenance: jsonb("provenance").$type<Provenance>().notNull(),
    createdAt: now("created_at"),
    lastSeenAt: now("last_seen_at"),
  },
  (t) => [
    uniqueIndex("edges_from_to_kind_uq").on(t.fromNodeId, t.toNodeId, t.kind),
    index("edges_user_idx").on(t.userId),
  ],
);

export const findingKind = pgEnum("finding_kind", [
  "zombie",
  "duplicate_plan",
  "wrong_tier",
  "expiring",
  "expired_card",
  "orphaned_key",
]);

export const findingStatus = pgEnum("finding_status", ["open", "confirmed", "dismissed"]);

/** What a finding points at, so the user can check it in one click. No message bodies. */
export type FindingEvidence = {
  inbox: string | null;
  subjects: string[];
  receiptIds: string[];
  repo?: string | null;
  lastActivityAt?: string | null;
};

/**
 * Derived: recomputed by src/lib/findings.ts from receipts and the graph. The
 * user's own verdict (confirmed, dismissed) survives recomputes through `key`.
 */
export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: findingKind("kind").notNull(),
    /** Stable per user and situation, e.g. "duplicate_plan:Vercel". Recomputes upsert on it. */
    key: text("key").notNull(),
    title: text("title").notNull(),
    /** What we suggest doing about it, one sentence. */
    action: text("action").notNull().default(""),
    /** Monthly dollar value in cents. Null means unknown, never a guess. */
    amountCents: integer("amount_cents"),
    currency: text("currency").notNull().default("USD"),
    nodeIds: uuid("node_ids").array().notNull().default(sql`'{}'::uuid[]`),
    evidence: jsonb("evidence").$type<FindingEvidence>().notNull().default({ inbox: null, subjects: [], receiptIds: [] }),
    confidence: real("confidence").notNull(),
    status: findingStatus("status").notNull().default("open"),
    computedAt: now("computed_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [index("findings_user_kind_idx").on(t.userId, t.kind), uniqueIndex("findings_user_key_uq").on(t.userId, t.key)],
);

// ---------------------------------------------------------------------------
// Sender verdicts: one small-model decision per sending domain, shared by every
// user. A domain is not personal data; the subjects used to decide are not
// stored. Decides, before any per-email call, whether a sender bills for
// software or infrastructure at all.
// ---------------------------------------------------------------------------

export const senderVerdict = pgEnum("sender_verdict", [
  "software_vendor",
  "consumer",
  "finance",
  "shipping",
  "notifications",
  "personal",
  "unknown",
]);

export const senderVerdicts = pgTable("sender_verdicts", {
  /** Sending domain, lowercase, as in the From address. */
  domain: text("domain").primaryKey(),
  verdict: senderVerdict("verdict").notNull(),
  /** Normalized vendor name when the sender is a software vendor. */
  vendor: text("vendor"),
  confidence: real("confidence").notNull(),
  model: text("model").notNull(),
  /** How many messages were seen when deciding; small samples are re-decided later. */
  sampleSize: integer("sample_size").notNull().default(0),
  decidedAt: now("decided_at"),
});

export type SenderVerdictRow = typeof senderVerdicts.$inferSelect;
export type SenderVerdictKind = (typeof senderVerdict.enumValues)[number];

// ---------------------------------------------------------------------------
// Vendor verdicts: is this vendor work (software, infrastructure, business
// services) or personal (consumer apps, health, home)? One cached decision per
// normalized vendor key, shared by every user. A vendor name is not personal data.
// ---------------------------------------------------------------------------

export const vendorScope = pgEnum("vendor_scope", ["work", "personal", "unknown"]);

export const vendorVerdicts = pgTable("vendor_verdicts", {
  /** src/lib/spend.ts vendorKey: lowercase letters and digits, aliases folded. */
  vendorKey: text("vendor_key").primaryKey(),
  vendor: text("vendor").notNull(),
  scope: vendorScope("scope").notNull(),
  confidence: real("confidence").notNull(),
  model: text("model").notNull(),
  decidedAt: now("decided_at"),
});

export type VendorVerdictRow = typeof vendorVerdicts.$inferSelect;

/** The user's own call on a vendor (work or personal). Wins over the shared verdict, survives recomputes. */
export const vendorScopeOverrides = pgTable(
  "vendor_scope_overrides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vendorKey: text("vendor_key").notNull(),
    scope: vendorScope("scope").notNull(),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("vendor_scope_overrides_uq").on(t.userId, t.vendorKey)],
);

// ---------------------------------------------------------------------------
// Recipes: the deterministic reader (ARCHITECTURE 2, Tier 2 template memory).
// The first email of a template is read by a model, which also writes anchors
// (regular expressions with one capture group) for each field. Later emails of
// the same template are parsed by code. A recipe whose output fails the checks
// is marked broken and rebuilt by the model. Shared by every user: anchors are
// labels and shapes, never values from anyone's mail.
// ---------------------------------------------------------------------------

export const recipeStatus = pgEnum("recipe_status", ["active", "broken"]);

export type RecipeAnchor = { pattern: string; flags?: string };
export type RecipeAnchors = Partial<
  Record<
    "amount" | "currency" | "tax" | "total" | "billed_at" | "period_start" | "period_end" | "due_at" | "plan" | "invoice_id" | "card_last4" | "account_email" | "project_name" | "domain_name",
    RecipeAnchor
  >
>;
export type RecipeDefaults = {
  type: string;
  vendor: string;
  cadence: string;
  currency: string | null;
  plan: string | null;
};

export const recipes = pgTable(
  "recipes",
  {
    /** Sender address plus a structural hash of the email (src/lib/gmail/body.ts). */
    fingerprint: text("fingerprint").primaryKey(),
    vendor: text("vendor").notNull(),
    version: integer("version").notNull().default(1),
    anchors: jsonb("anchors").$type<RecipeAnchors>().notNull(),
    defaults: jsonb("defaults").$type<RecipeDefaults>().notNull(),
    status: recipeStatus("status").notNull().default("active"),
    hits: integer("hits").notNull().default(0),
    misses: integer("misses").notNull().default(0),
    /** Which model wrote the anchors. */
    model: text("model").notNull(),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("recipes_vendor_idx").on(t.vendor)],
);

export type RecipeRow = typeof recipes.$inferSelect;

// ---------------------------------------------------------------------------
// Receipts: what the reading pipeline (ARCHITECTURE 2, Tiers 1 to 3) extracted
// from a billing email. The body is never stored; the record and the message
// id are enough to re-read it from the provider.
// ---------------------------------------------------------------------------

export const receiptKind = pgEnum("receipt_kind", [
  "receipt",
  "renewal_notice",
  "plan_change",
  "trial_notice",
  "payment_failed",
  "domain_or_dns",
  "deployment",
  "incident_alert",
  "deprecation_notice",
  "account_security",
  "other",
]);

export type ReceiptChecks = {
  /** Names of the Tier 3 checks that passed. */
  passed: string[];
  /** Names of the checks that failed, with a short reason. */
  failed: { check: string; reason: string }[];
};

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: receiptKind("kind").notNull(),
    /** Normalized vendor name, e.g. "Vercel". Processor receipts name the real vendor. */
    vendor: text("vendor").notNull(),
    /** Pre-tax amount in minor units. Null when the email carries no amount. */
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    billedAt: timestamp("billed_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    /** Renewal, due or expiry date named in a notice. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    plan: text("plan"),
    projectNames: text("project_names").array().notNull().default(sql`'{}'::text[]`),
    domainNames: text("domain_names").array().notNull().default(sql`'{}'::text[]`),
    accountEmail: text("account_email"),
    cardLast4: text("card_last4"),
    invoiceId: text("invoice_id"),
    /** Short status word from the email: paid, failed, refunded, trial, cancelled. */
    status: text("status"),
    /** Billing cadence the email states: monthly, annual, usage, one_time, unknown. */
    cadence: text("cadence"),
    /** DKIM or DMARC passed and aligned with the sender domain. Findings need true. */
    senderVerified: boolean("sender_verified").notNull().default(false),
    /** Sender address plus a structural hash of the HTML; the key for parsing recipes later. */
    templateFingerprint: text("template_fingerprint"),
    /** Combined classifier, extractor and check confidence, 0 to 1. */
    confidence: real("confidence").notNull(),
    checks: jsonb("checks").$type<ReceiptChecks>().notNull().default({ passed: [], failed: [] }),
    /** Which model produced the record, for cost tracking and shadow runs. */
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    extractedAt: now("extracted_at"),
  },
  (t) => [
    uniqueIndex("receipts_message_uq").on(t.messageId),
    index("receipts_user_vendor_idx").on(t.userId, t.vendor),
    index("receipts_user_billed_idx").on(t.userId, t.billedAt),
  ],
);

/**
 * Append-only. The only code path is appendAudit() in src/lib/audit.ts, and the
 * 0001 migration installs a trigger that rejects UPDATE and DELETE.
 * actor is free text ("user:<id>", "api_key:<id>", "system:mass-revoke") with no
 * foreign key, so rows survive account deletion.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    userId: text("user_id"),
    action: text("action").notNull(),
    target: text("target").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: now("created_at"),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt)],
);

/** One row per completed model call, including calls with unusable output. */
export const modelUsage = pgTable(
  "model_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    stage: text("stage").$type<"sender_verdict" | "extract_cheap" | "extract_escalate" | "recipe_build">().notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    costCents: integer("cost_cents").notNull(),
    createdAt: now("created_at"),
  },
  (t) => [index("model_usage_user_created_idx").on(t.userId, t.createdAt), index("model_usage_created_idx").on(t.createdAt)],
);

/**
 * Alerts sent to a person: one row per alert, keyed so the same failure is never sent twice.
 * Payload holds what the email said (project, cause, a few log lines): never a token, never
 * a body of mail. Sending failures are recorded, not retried in a loop.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"deploy_failed" | "job_quiet" | "job_failed" | "job_recovered" | "channel_test" | "server_errors" | "server_errors_recovered" | "site_down" | "site_recovered" | "expiration" | "daily_digest">().notNull(),
    /** Stable per event, e.g. deploy_failed:<deployment id>. Unique per user. */
    key: text("key").notNull(),
    channel: text("channel").$type<"email" | "ntfy" | "slack" | "teams" | "channels">().notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: now("created_at"),
  },
  (t) => [uniqueIndex("alerts_user_key_uq").on(t.userId, t.key), index("alerts_user_created_idx").on(t.userId, t.createdAt)],
);

/** Per-user alert switches. No row means the defaults: deploy failures on. */
export const alertSettings = pgTable("alert_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  deployFailed: boolean("deploy_failed").notNull().default(true),
  /** The morning summary: what needs you, what alerted in the last day, what is fine. */
  dailyDigest: boolean("daily_digest").notNull().default(true),
  updatedAt: now("updated_at"),
});

/**
 * Usage events, first party and cookieless: the funnel each launch post is scored by.
 * One row per event, with the link tag that brought the person in. No ids beyond our own
 * user id, no IP, no user agent, no email content. Page views live in Vercel Web Analytics.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event: text("event").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** The ?ref= tag on the first visit (x-launch, hn, li-1104), or null. */
    ref: text("ref"),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    path: text("path"),
    props: jsonb("props").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: now("created_at"),
  },
  (t) => [index("usage_events_event_created_idx").on(t.event, t.createdAt), index("usage_events_user_idx").on(t.userId)],
);

/** The first link tag each person arrived with, so later server-side events can be credited to it. */
export const userRefs = pgTable("user_refs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  ref: text("ref"),
  utmSource: text("utm_source"),
  utmCampaign: text("utm_campaign"),
  landingPath: text("landing_path"),
  firstSeenAt: now("first_seen_at"),
});

/**
 * Check-in jobs: a scheduled job hits its link when it runs; when it stops, the owner hears.
 * The token in the link is the only credential, random, unique, and never shown in a list
 * after creation except to the owner. Periods and grace are minutes.
 */
export const checkinJobs = pgTable(
  "checkin_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    token: text("token").notNull(),
    /** Expected gap between check-ins. */
    periodMinutes: integer("period_minutes").notNull(),
    /** How late a check-in may be before the job counts as quiet. */
    graceMinutes: integer("grace_minutes").notNull().default(10),
    /** "owner/repo" or a project name the job belongs to, for the Today row. */
    project: text("project"),
    owner: text("owner"),
    maxRunMinutes: integer("max_run_minutes"),
    minCount: integer("min_count"),
    source: text("source").$type<"manual" | "vercel">().notNull().default("manual"),
    externalRef: text("external_ref"),
    path: text("path"),
    schedule: text("schedule"),
    timeZone: text("time_zone"),
    probe: jsonb("probe").$type<{ url: string; expect: { path: string; op: "eq" | "gte" | "lte" | "gt" | "lt" | "exists"; value?: string | number | boolean }[] }>(),
    requestMethod: text("request_method"),
    vercelConnectionId: uuid("vercel_connection_id"),
    vercelProjectId: text("vercel_project_id"),
    vercelScopeId: text("vercel_scope_id"),
    vercelDeploymentId: text("vercel_deployment_id"),
    lastEvidenceCheckedAt: timestamp("last_evidence_checked_at", { withTimezone: true }),
    evidenceState: text("evidence_state").$type<"ok" | "not_readable" | "unavailable">(),
    status: text("status").$type<"new" | "up" | "late" | "down" | "paused" | "retired">().notNull().default("new"),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
    lastPingKind: text("last_ping_kind"),
    lastNote: text("last_note"),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    missCount: integer("miss_count").notNull().default(0),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [uniqueIndex("checkin_jobs_token_uq").on(t.token), uniqueIndex("checkin_jobs_user_external_ref_uq").on(t.userId, t.externalRef), index("checkin_jobs_user_idx").on(t.userId), index("checkin_jobs_due_idx").on(t.status, t.nextDueAt)],
);

/** Each check-in, briefly: kind ok, start or fail, and a short note the job sent. Pruned after 30 days. */
export const checkinPings = pgTable(
  "checkin_pings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => checkinJobs.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"ok" | "start" | "fail">().notNull(),
    note: text("note"),
    count: integer("count"),
    at: now("at"),
  },
  (t) => [index("checkin_pings_job_at_idx").on(t.jobId, t.at)],
);

/** Where alerts go: an ntfy topic, a Slack or Teams webhook, or an email address. Targets are encrypted at rest. */
export const alertChannels = pgTable(
  "alert_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"ntfy" | "slack" | "teams" | "email">().notNull(),
    label: text("label").notNull(),
    project: text("project"),
    encryptedTarget: text("encrypted_target").notNull(),
    keyId: text("key_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: now("created_at"),
  },
  (t) => [index("alert_channels_user_idx").on(t.userId)],
);

export const apiKeyScope = pgEnum("api_key_scope", ["read", "write", "approve"]);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hex of the full "sp_..." key. The key itself is shown once and never stored. */
    hashedKey: text("hashed_key").notNull().unique(),
    /** First characters of the key, for display ("sp_ab12"). */
    prefix: text("prefix").notNull(),
    scopes: apiKeyScope("scopes").array().notNull(),
    createdAt: now("created_at"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const trackedExpirations = pgTable(
  "tracked_expirations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"api_key" | "token" | "certificate" | "other">().notNull(),
    name: text("name").notNull(),
    provider: text("provider"),
    hint: text("hint"),
    project: text("project"),
    expiresOn: date("expires_on").notNull(),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    index("tracked_expirations_user_expires_idx").on(t.userId, t.expiresOn),
    check("tracked_expirations_kind_check", sql`${t.kind} in ('api_key', 'token', 'certificate', 'other')`),
    check("tracked_expirations_name_check", sql`char_length(${t.name}) between 1 and 80`),
    check("tracked_expirations_provider_check", sql`${t.provider} is null or char_length(${t.provider}) <= 40`),
    check("tracked_expirations_hint_check", sql`${t.hint} is null or char_length(${t.hint}) <= 6`),
    check("tracked_expirations_project_check", sql`${t.project} is null or char_length(${t.project}) <= 120`),
  ],
);

/** Optional mirror of analytics events (ARCHITECTURE 5c). */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    name: text("name").notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now("created_at"),
  },
  (t) => [index("events_name_idx").on(t.name, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Gmail backfill: headers only, never bodies.
// ---------------------------------------------------------------------------

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    gmailMessageId: text("gmail_message_id").notNull(),
    threadId: text("thread_id").notNull(),
    from: text("from"),
    replyTo: text("reply_to"),
    subject: text("subject"),
    date: timestamp("date", { withTimezone: true }),
    listUnsubscribe: boolean("list_unsubscribe").notNull().default(false),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    attachmentNames: text("attachment_names").array().notNull().default(sql`'{}'::text[]`),
    /** Why Tier 0 kept this message, e.g. "query:billing_senders" or "subject:receipt". */
    tier0Reason: text("tier0_reason").notNull(),
    // Tier 1 (small model, headers plus a body snippet). Null until read.
    tier1Type: text("tier1_type"),
    tier1Vendor: text("tier1_vendor"),
    tier1Confidence: real("tier1_confidence"),
    /** Set when a reading run claims the message; the claim is what stops two runs reading it twice. */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Short, token-free reason when reading stopped early for this message. */
    readError: text("read_error"),
    createdAt: now("created_at"),
    updatedAt: now("updated_at"),
  },
  (t) => [
    // Gmail message ids are unique per mailbox, so the upsert key includes the connection.
    uniqueIndex("messages_connection_gmail_id_uq").on(t.connectionId, t.gmailMessageId),
  ],
);

export const syncPhase = pgEnum("sync_phase", ["search", "exhaustive", "done"]);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    workflowRunId: text("workflow_run_id"),
    phase: syncPhase("phase").notNull().default("search"),
    scanned: integer("scanned").notNull().default(0),
    candidates: integer("candidates").notNull().default(0),
    /**
     * How many items the run expects to scan in all, when known: Gmail's size
     * estimate for the exhaustive query plus the search phase, or GitHub's repo
     * count. Rough; never shown without "about". Null until the run knows.
     */
    totalEstimate: integer("total_estimate"),
    /** Short, token-free error description when a run stops early. */
    error: text("error"),
    /**
     * Where a run stopped early so the next sync resumes there. GitHub: the last
     * repo id fully synced, when the run paused at a low rate limit.
     */
    cursor: text("cursor"),
    startedAt: now("started_at"),
    updatedAt: now("updated_at"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("sync_runs_connection_idx").on(t.connectionId, t.startedAt)],
);

export const deletionRequestStatus = pgEnum("deletion_request_status", [
  "scheduled",
  "completed",
  "cancelled",
]);

export const deletionRequests = pgTable("deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  status: deletionRequestStatus("status").notNull().default("scheduled"),
  requestedAt: now("requested_at"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Connection = typeof connections.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type EdgeRow = typeof edges.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type ApiKeyScope = (typeof apiKeyScope.enumValues)[number];
export type ConnectionProvider = (typeof connectionProvider.enumValues)[number];
export type MessageRow = typeof messages.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptInsert = typeof receipts.$inferInsert;
export type ReceiptKind = (typeof receiptKind.enumValues)[number];
export type Finding = typeof findings.$inferSelect;
export type FindingKind = (typeof findingKind.enumValues)[number];

/**
 * One row per background job of our own: when it last ran and whether it finished. Read by
 * /api/health/watch so a check that lives outside this product can tell when our watcher stops.
 * Without it, a dead watcher means every job goes quiet and nobody hears.
 */
export const systemHeartbeats = pgTable("system_heartbeats", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  lastOk: boolean("last_ok").notNull(),
  detail: text("detail"),
});
