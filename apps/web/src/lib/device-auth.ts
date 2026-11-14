/**
 * Agent sign-in, shaped like OAuth device authorization (RFC 8628) and `gh auth login`.
 *
 * 1. An agent's setup script calls start: it gets a secret deviceCode and a short userCode.
 * 2. The human opens /link while signed in, checks the code matches the terminal, and approves.
 * 3. The script polls token with its deviceCode and, once approved, receives its own read key.
 *
 * Storage is the auth library's `verification` table (no migration): one row per request,
 * keyed by the hash of the deviceCode, and one row mapping the userCode to that hash. The raw
 * deviceCode is never stored. Every state change is a compare-and-set on the row's value, so
 * two concurrent polls can never mint two keys and an approve can never race a deny.
 *
 * This module holds the pure helpers and the request handlers; the database side is injected
 * (src/lib/device-auth-db.ts) so the whole flow is tested without a database.
 */
import { randomInt } from "node:crypto";
import type { Actor } from "./actor";
import { randomToken, sha256Hex } from "./crypto";
import { ApiError, json } from "./http";
import { RateLimiter } from "./rate-limiter";
import { formatUserCode, normalizeUserCode, USER_CODE_ALPHABET, USER_CODE_LENGTH } from "./device-code";

export const DEVICE_TTL_SEC = 600;
export const POLL_INTERVAL_SEC = 5;
/** Polls closer together than this get slow_down. */
export const MIN_POLL_GAP_MS = 4000;

export { formatUserCode, normalizeUserCode, USER_CODE_ALPHABET } from "./device-code";

export type DeviceStatus = "pending" | "approved" | "denied" | "consumed";

export type DeviceRecord = {
  userCode: string;
  client: string;
  machine: string;
  status: DeviceStatus;
  userId?: string;
  decidedAt?: string;
  lastPollAt?: string;
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Eight characters from the unambiguous alphabet, shown as ABCD-EFGH. */
export function generateUserCode(rand: (max: number) => number = randomInt): string {
  let raw = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) raw += USER_CODE_ALPHABET[rand(USER_CODE_ALPHABET.length)];
  return formatUserCode(raw);
}

export function generateDeviceCode(): string {
  return randomToken(32);
}

export function deviceIdentifier(deviceCode: string): string {
  return `device:${sha256Hex(deviceCode)}`;
}

export function userCodeIdentifier(userCode: string): string {
  return `device-user:${userCode}`;
}

/** The agent kind: letters, digits, dot, underscore, space, dash; up to 40. */
export function parseClient(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v || v.length > 40 || !/^[A-Za-z0-9._ -]+$/.test(v)) return null;
  return v;
}

/**
 * The computer's self-reported name. Control and invisible formatting characters are removed
 * (so a name cannot reorder the approve page's text), runs of space collapse, and it is cut to 60.
 */
export function parseMachine(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 60)
    .trim();
  return v || null;
}

const CLIENT_LABELS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

export function clientLabel(client: string): string {
  return CLIENT_LABELS[client.toLowerCase()] ?? client;
}

export function keyName(client: string, machine: string): string {
  return `${clientLabel(client)} on ${machine}`.slice(0, 80);
}

export function parseRecord(value: string): DeviceRecord | null {
  try {
    const r = JSON.parse(value) as DeviceRecord;
    return r && typeof r.userCode === "string" && typeof r.status === "string" ? r : null;
  } catch {
    return null;
  }
}

export type PollOutcome =
  | { kind: "authorization_pending" | "slow_down"; next: DeviceRecord }
  | { kind: "access_denied" | "expired_token" }
  | { kind: "mint"; next: DeviceRecord };

/** What a token poll does to a live record. Expired rows never reach here. */
export function pollTransition(record: DeviceRecord, now: Date): PollOutcome {
  switch (record.status) {
    case "denied":
      return { kind: "access_denied" };
    case "consumed":
      return { kind: "expired_token" };
    case "approved":
      return { kind: "mint", next: { ...record, status: "consumed", lastPollAt: now.toISOString() } };
    case "pending": {
      const last = record.lastPollAt ? Date.parse(record.lastPollAt) : NaN;
      const tooSoon = Number.isFinite(last) && now.getTime() - last < MIN_POLL_GAP_MS;
      return { kind: tooSoon ? "slow_down" : "authorization_pending", next: { ...record, lastPollAt: now.toISOString() } };
    }
    default:
      return { kind: "expired_token" };
  }
}

/** The human's decision. Only a pending request can be decided, and only once. */
export function decideTransition(record: DeviceRecord, userId: string, approve: boolean, now: Date): DeviceRecord | null {
  if (record.status !== "pending") return null;
  return { ...record, status: approve ? "approved" : "denied", userId, decidedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Per-IP limit on start, using the shared token bucket. In memory, so it is per server
// instance: a brake on a runaway script, not a wall.
// ---------------------------------------------------------------------------

export const START_LIMIT = { count: 10, perSeconds: 600 };

export function createIpLimiter(opts: { count: number; perSeconds: number; now?: () => number; maxIps?: number }) {
  const buckets = new Map<string, RateLimiter>();
  const maxIps = opts.maxIps ?? 5000;
  return function allow(ip: string): boolean {
    let b = buckets.get(ip);
    if (!b) {
      if (buckets.size >= maxIps) buckets.delete(buckets.keys().next().value!);
      b = new RateLimiter({ ratePerSecond: opts.count / opts.perSeconds, capacity: opts.count, now: opts.now });
      buckets.set(ip, b);
    }
    return b.tryTake(1);
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// ---------------------------------------------------------------------------
// Handlers. Route files wrap these with api().
// ---------------------------------------------------------------------------

export type StoredRow = { value: string; expiresAt: Date };

export type DeviceStore = {
  /** Insert rows in the verification table. */
  insert(rows: { identifier: string; value: string; expiresAt: Date }[]): Promise<void>;
  /** The newest row for this identifier that has not expired at `now`. */
  get(identifier: string, now: Date): Promise<StoredRow | null>;
  /** Replace the value only if it still equals `expected` and has not expired. True when exactly one row changed. */
  compareAndSet(identifier: string, expected: string, next: string, now: Date): Promise<boolean>;
  /** Housekeeping: drop expired device rows. */
  purgeExpired(now: Date): Promise<void>;
};

export type MintedKey = { id: string; key: string; name: string; prefix: string; scopes: string[] };

export type DeviceDeps = {
  store: DeviceStore;
  origin: () => string;
  now?: () => Date;
  requireActor: (req: Request, scope: "approve") => Promise<Actor>;
  /** Insert a read key for the user. Returns the plaintext key once. */
  mintKey: (userId: string, name: string) => Promise<MintedKey>;
  audit: (entry: { actor: string; userId: string; action: string; target: string; after?: unknown }) => Promise<void>;
  track: (userId: string) => Promise<void>;
  allowStart: (ip: string) => boolean;
};

function tokenError(code: string, message: string) {
  return json({ error: code, message }, { status: 400 });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function createDeviceHandlers(deps: DeviceDeps) {
  const now = deps.now ?? (() => new Date());

  async function requireSession(req: Request): Promise<Actor> {
    const actor = await deps.requireActor(req, "approve");
    if (actor.via !== "session") throw new ApiError(403, "session_required", "Approve an agent from a signed-in browser.");
    return actor;
  }

  /** A pending-or-decided request by its user code, or a 404. */
  async function findByUserCode(input: unknown, at: Date) {
    const userCode = normalizeUserCode(input);
    if (!userCode) throw new ApiError(404, "unknown_code", "That code is not one we know, or it expired. Start again in your terminal.");
    const link = await deps.store.get(userCodeIdentifier(userCode), at);
    const identifier = link ? `device:${link.value}` : null;
    const row = identifier ? await deps.store.get(identifier, at) : null;
    const record = row ? parseRecord(row.value) : null;
    if (!identifier || !row || !record || record.userCode !== userCode) {
      throw new ApiError(404, "unknown_code", "That code is not one we know, or it expired. Start again in your terminal.");
    }
    return { identifier, row, record };
  }

  return {
    async start(req: Request): Promise<Response> {
      if (!deps.allowStart(clientIp(req))) {
        throw new ApiError(429, "rate_limited", "Too many sign-in starts from this network. Wait a few minutes.");
      }
      const body = await readJson(req);
      const client = parseClient(body.client);
      if (!client) throw new ApiError(400, "invalid_client", "client must be 1 to 40 letters, digits, dots, dashes, underscores or spaces, like claude-code.");
      const machine = parseMachine(body.machine);
      if (!machine) throw new ApiError(400, "invalid_machine", "machine must be this computer's name.");

      const at = now();
      await deps.store.purgeExpired(at).catch(() => undefined);
      let userCode = generateUserCode();
      for (let i = 0; i < 5 && (await deps.store.get(userCodeIdentifier(userCode), at)); i++) userCode = generateUserCode();

      const deviceCode = generateDeviceCode();
      const hash = sha256Hex(deviceCode);
      const expiresAt = new Date(at.getTime() + DEVICE_TTL_SEC * 1000);
      const record: DeviceRecord = { userCode, client, machine, status: "pending" };
      await deps.store.insert([
        { identifier: `device:${hash}`, value: JSON.stringify(record), expiresAt },
        { identifier: userCodeIdentifier(userCode), value: hash, expiresAt },
      ]);
      const verificationUri = `${deps.origin()}/link`;
      return json({
        deviceCode,
        userCode,
        verificationUri,
        verificationUriComplete: `${verificationUri}?code=${userCode}`,
        expiresIn: DEVICE_TTL_SEC,
        interval: POLL_INTERVAL_SEC,
      });
    },

    async token(req: Request): Promise<Response> {
      const body = await readJson(req);
      const deviceCode = body.deviceCode;
      if (typeof deviceCode !== "string" || deviceCode.length < 20 || deviceCode.length > 200) {
        return tokenError("invalid_request", "Send the deviceCode from start.");
      }
      const at = now();
      const identifier = deviceIdentifier(deviceCode);
      const row = await deps.store.get(identifier, at);
      const record = row ? parseRecord(row.value) : null;
      if (!row || !record) return tokenError("expired_token", "This sign-in expired or was already used. Start again.");

      const outcome = pollTransition(record, at);
      switch (outcome.kind) {
        case "access_denied":
          return tokenError("access_denied", "The request was denied. Nothing was shared.");
        case "expired_token":
          return tokenError("expired_token", "This sign-in expired or was already used. Start again.");
        case "authorization_pending":
        case "slow_down": {
          // Best effort: a lost race here only means the next poll is not checked for speed.
          await deps.store.compareAndSet(identifier, row.value, JSON.stringify(outcome.next), at);
          return outcome.kind === "slow_down"
            ? tokenError("slow_down", `Polling too fast. Wait ${POLL_INTERVAL_SEC} seconds between tries.`)
            : tokenError("authorization_pending", "Waiting for you to approve in the browser.");
        }
        case "mint": {
          // Exactly one poll wins the approved -> consumed flip; only the winner mints.
          const won = await deps.store.compareAndSet(identifier, row.value, JSON.stringify(outcome.next), at);
          if (!won) return tokenError("expired_token", "This sign-in expired or was already used. Start again.");
          const userId = record.userId!;
          const name = keyName(record.client, record.machine);
          const minted = await deps.mintKey(userId, name);
          await deps.audit({
            actor: `user:${userId}`,
            userId,
            action: "api_key.created",
            target: `api_key:${minted.id}`,
            after: { scopes: minted.scopes, via: "device", client: record.client, machine: record.machine },
          });
          await deps.track(userId);
          return json({ key: minted.key, name: minted.name, prefix: minted.prefix, scopes: minted.scopes });
        }
      }
    },

    /** The approve page's read: which agent and machine are asking. Session only. */
    async lookup(req: Request): Promise<Response> {
      await requireSession(req);
      const at = now();
      const { row, record } = await findByUserCode(new URL(req.url).searchParams.get("userCode"), at);
      return json({
        userCode: record.userCode,
        client: record.client,
        clientLabel: clientLabel(record.client),
        machine: record.machine,
        status: record.status === "consumed" ? "approved" : record.status,
        expiresAt: row.expiresAt.toISOString(),
      });
    },

    async approve(req: Request): Promise<Response> {
      // Approving mints a key, so only Spooky's own page may ask. Browsers mark a request from
      // another site; the session cookie's SameSite rule is the first wall, this is the second.
      const site = req.headers.get("sec-fetch-site");
      if (site && site !== "same-origin") throw new ApiError(403, "cross_site", "Approve from the Spooky Particles page.");
      const actor = await requireSession(req);
      const body = await readJson(req);
      if (typeof body.approve !== "boolean") throw new ApiError(400, "invalid_request", "approve must be true or false.");
      const approve = body.approve;
      // A poll may rewrite the row between our read and write; re-read and try again.
      for (let attempt = 0; attempt < 4; attempt++) {
        const at = now();
        const { identifier, row, record } = await findByUserCode(body.userCode, at);
        const next = decideTransition(record, actor.userId, approve, at);
        if (!next) throw new ApiError(409, "already_decided", "This code was already approved or denied.");
        if (await deps.store.compareAndSet(identifier, row.value, JSON.stringify(next), at)) {
          await deps.audit({
            actor: actor.label,
            userId: actor.userId,
            action: approve ? "device.approved" : "device.denied",
            target: `device:${record.userCode}`,
            after: { client: record.client, machine: record.machine },
          });
          return json({ status: next.status });
        }
      }
      throw new ApiError(409, "busy", "That didn't save. Try again.");
    },
  };
}
