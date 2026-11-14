import { beforeEach, describe, expect, it, vi } from "vitest";

// api() asks Next for a request scope; outside Next there is none.
vi.mock("next/server", () => ({ connection: async () => undefined }));

import type { Actor } from "./actor";
import { sha256Hex } from "./crypto";
import {
  clientLabel,
  createDeviceHandlers,
  createIpLimiter,
  decideTransition,
  DEVICE_TTL_SEC,
  generateUserCode,
  keyName,
  normalizeUserCode,
  parseClient,
  parseMachine,
  pollTransition,
  USER_CODE_ALPHABET,
  type DeviceDeps,
  type DeviceRecord,
  type DeviceStore,
} from "./device-auth";
import { ApiError, api } from "./http";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("user codes", () => {
  it("are eight characters from the alphabet, shown with a dash", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUserCode();
      expect(code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
      for (const ch of code.replace("-", "")) expect(USER_CODE_ALPHABET).toContain(ch);
    }
  });

  it("the alphabet has no lookalikes or vowels", () => {
    for (const ch of "0O1IL5AEIOU") expect(USER_CODE_ALPHABET).not.toContain(ch);
  });

  it("normalizes case, dashes and spaces", () => {
    expect(normalizeUserCode("bcdf-ghjk")).toBe("BCDF-GHJK");
    expect(normalizeUserCode("BCDFGHJK")).toBe("BCDF-GHJK");
    expect(normalizeUserCode(" bcdf ghjk ")).toBe("BCDF-GHJK");
  });

  it("rejects anything that cannot be a code", () => {
    expect(normalizeUserCode("BCDF-GHJ")).toBeNull();
    expect(normalizeUserCode("BCDF-GHJKM")).toBeNull();
    expect(normalizeUserCode("ABCD-EFGH")).toBeNull(); // vowels
    expect(normalizeUserCode("BCD0-GHJK")).toBeNull();
    expect(normalizeUserCode(42)).toBeNull();
    expect(normalizeUserCode(null)).toBeNull();
  });
});

describe("client and machine", () => {
  it("accepts agent kinds and refuses odd ones", () => {
    expect(parseClient(" claude-code ")).toBe("claude-code");
    expect(parseClient("Codex 2.1_beta")).toBe("Codex 2.1_beta");
    expect(parseClient("")).toBeNull();
    expect(parseClient("x".repeat(41))).toBeNull();
    expect(parseClient("<script>")).toBeNull();
    expect(parseClient(7)).toBeNull();
  });

  it("strips control and direction characters from the machine name and caps it at 60", () => {
    expect(parseMachine("  Nates-MacBook\u0007-Pro  ")).toBe("Nates-MacBook-Pro");
    expect(parseMachine("evil‮exe.cod")).toBe("evilexe.cod");
    expect(parseMachine("a\n\tb")).toBe("a b");
    expect(parseMachine("m".repeat(90))).toHaveLength(60);
    expect(parseMachine("\u0000\u0001")).toBeNull();
    expect(parseMachine(undefined)).toBeNull();
  });

  it("names the key after the agent and machine", () => {
    expect(clientLabel("claude-code")).toBe("Claude Code");
    expect(clientLabel("codex")).toBe("Codex");
    expect(clientLabel("aider")).toBe("aider");
    expect(keyName("claude-code", "studio")).toBe("Claude Code on studio");
  });
});

describe("state transitions", () => {
  const base: DeviceRecord = { userCode: "BCDF-GHJK", client: "codex", machine: "m", status: "pending" };
  const t0 = new Date("2026-11-13T10:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);

  it("pending stays pending and records the poll", () => {
    const r = pollTransition(base, t0);
    expect(r.kind).toBe("authorization_pending");
    expect("next" in r && r.next.lastPollAt).toBe(t0.toISOString());
  });

  it("polling faster than every 4 seconds gets slow_down", () => {
    const polled = { ...base, lastPollAt: t0.toISOString() };
    expect(pollTransition(polled, at(3000)).kind).toBe("slow_down");
    expect(pollTransition(polled, at(4000)).kind).toBe("authorization_pending");
  });

  it("approved mints once, then reads as used", () => {
    const approved = decideTransition(base, "u1", true, t0)!;
    expect(approved).toMatchObject({ status: "approved", userId: "u1" });
    const r = pollTransition(approved, at(5000));
    expect(r.kind).toBe("mint");
    if (r.kind !== "mint") throw new Error();
    expect(r.next.status).toBe("consumed");
    expect(pollTransition(r.next, at(10_000)).kind).toBe("expired_token");
  });

  it("denied answers access_denied", () => {
    const denied = decideTransition(base, "u1", false, t0)!;
    expect(denied.status).toBe("denied");
    expect(pollTransition(denied, t0).kind).toBe("access_denied");
  });

  it("only a pending request can be decided", () => {
    for (const status of ["approved", "denied", "consumed"] as const) {
      expect(decideTransition({ ...base, status }, "u2", true, t0)).toBeNull();
    }
  });
});

describe("per-IP start limit", () => {
  it("allows the burst, refuses the next, refills over time", () => {
    let t = 0;
    const allow = createIpLimiter({ count: 3, perSeconds: 60, now: () => t });
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
    t = 20_000;
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-level flow through api(), with an in-memory verification table
// ---------------------------------------------------------------------------

type Row = { identifier: string; value: string; expiresAt: Date; createdAt: number };

function memoryStore(): DeviceStore & { rows: Row[] } {
  const rows: Row[] = [];
  let seq = 0;
  return {
    rows,
    async insert(rs) {
      for (const r of rs) rows.push({ ...r, createdAt: seq++ });
    },
    async get(identifier, now) {
      const live = rows.filter((r) => r.identifier === identifier && r.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
      return live[0] ? { value: live[0].value, expiresAt: live[0].expiresAt } : null;
    },
    async compareAndSet(identifier, expected, next, now) {
      const hits = rows.filter((r) => r.identifier === identifier && r.value === expected && r.expiresAt > now);
      for (const r of hits) r.value = next;
      return hits.length === 1;
    },
    async purgeExpired(now) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].expiresAt < now) rows.splice(i, 1);
    },
  };
}

const session: Actor = { userId: "u_nate", via: "session", scopes: ["read", "write", "approve"], label: "user:u_nate" };
const keyActor: Actor = { userId: "u_nate", via: "api_key", scopes: ["read", "write", "approve"], apiKeyId: "k1", label: "api_key:k1" };

let clock: Date;
let store: ReturnType<typeof memoryStore>;
let deps: DeviceDeps;
let actor: Actor | null;
let routes: ReturnType<typeof wire>;

function wire(d: DeviceDeps) {
  const h = createDeviceHandlers(d);
  return { start: api(h.start), token: api(h.token), lookup: api(h.lookup), approve: api(h.approve) };
}

beforeEach(() => {
  clock = new Date("2026-11-13T10:00:00Z");
  store = memoryStore();
  actor = session;
  let n = 0;
  deps = {
    store,
    origin: () => "https://spookyparticles.com",
    now: () => clock,
    requireActor: vi.fn(async () => {
      if (!actor) throw new ApiError(401, "unauthenticated", "Sign in or send an API key");
      return actor;
    }),
    mintKey: vi.fn(async (_userId: string, name: string) => {
      n++;
      return { id: `key${n}`, key: `sp_minted_${n}`, name, prefix: "sp_mint", scopes: ["read"] };
    }),
    audit: vi.fn(async () => undefined),
    track: vi.fn(async () => undefined),
    allowStart: () => true,
  };
  routes = wire(deps);
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://spookyparticles.com${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const tick = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

async function start(client = "claude-code", machine = "studio") {
  const res = await routes.start(post("/api/v1/device/start", { client, machine }), undefined);
  return { res, body: await res.json() };
}

async function poll(deviceCode: string) {
  const res = await routes.token(post("/api/v1/device/token", { deviceCode }), undefined);
  return { status: res.status, body: await res.json() };
}

async function decide(userCode: string, approve: boolean) {
  const res = await routes.approve(post("/api/v1/device/approve", { userCode, approve }), undefined);
  return { status: res.status, body: await res.json() };
}

describe("POST /api/v1/device/start", () => {
  it("returns the device flow shape and stores only the hash", async () => {
    const { res, body } = await start();
    expect(res.status).toBe(200);
    expect(body.deviceCode.length).toBeGreaterThanOrEqual(43);
    expect(body.userCode).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(body.verificationUri).toBe("https://spookyparticles.com/link");
    expect(body.verificationUriComplete).toBe(`https://spookyparticles.com/link?code=${body.userCode}`);
    expect(body.expiresIn).toBe(600);
    expect(body.interval).toBe(5);

    const all = JSON.stringify(store.rows);
    expect(all).not.toContain(body.deviceCode);
    expect(store.rows.map((r) => r.identifier).sort()).toEqual([`device-user:${body.userCode}`, `device:${sha256Hex(body.deviceCode)}`].sort());
    expect(store.rows[0].expiresAt.getTime() - clock.getTime()).toBe(DEVICE_TTL_SEC * 1000);
  });

  it("refuses a bad client or a missing machine", async () => {
    expect((await start("<bad>", "m")).res.status).toBe(400);
    expect((await start("x".repeat(41), "m")).res.status).toBe(400);
    const { res, body } = await start("codex", "\u0000");
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_machine");
    expect(store.rows).toHaveLength(0);
  });

  it("is rate limited by IP", async () => {
    deps.allowStart = createIpLimiter({ count: 2, perSeconds: 600 });
    routes = wire(deps);
    const h = { "x-forwarded-for": "203.0.113.9, 10.0.0.1" };
    const go = () => routes.start(post("/api/v1/device/start", { client: "codex", machine: "m" }, h), undefined);
    expect((await go()).status).toBe(200);
    expect((await go()).status).toBe(200);
    expect((await go()).status).toBe(429);
  });
});

describe("POST /api/v1/device/token", () => {
  it("is pending until approved, and slow_down when polled too fast", async () => {
    const { body } = await start();
    expect(await poll(body.deviceCode)).toEqual({ status: 400, body: { error: "authorization_pending", message: expect.any(String) } });
    tick(1000);
    expect((await poll(body.deviceCode)).body.error).toBe("slow_down");
    tick(5000);
    expect((await poll(body.deviceCode)).body.error).toBe("authorization_pending");
  });

  it("approve then token mints exactly once; the second poll gets expired_token", async () => {
    const { body } = await start("claude-code", "studio");
    expect(await decide(body.userCode.toLowerCase().replace("-", ""), true)).toEqual({ status: 200, body: { status: "approved" } });
    tick(5000);
    const first = await poll(body.deviceCode);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ key: "sp_minted_1", name: "Claude Code on studio", prefix: "sp_mint", scopes: ["read"] });
    expect(deps.mintKey).toHaveBeenCalledWith("u_nate", "Claude Code on studio");
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "api_key.created", target: "api_key:key1", after: { scopes: ["read"], via: "device", client: "claude-code", machine: "studio" } }),
    );
    expect(deps.track).toHaveBeenCalledWith("u_nate");
    tick(5000);
    expect((await poll(body.deviceCode)).body.error).toBe("expired_token");
    expect(deps.mintKey).toHaveBeenCalledTimes(1);
  });

  it("two concurrent polls on an approved code mint one key", async () => {
    const { body } = await start();
    await decide(body.userCode, true);
    tick(5000);
    const [a, b] = await Promise.all([poll(body.deviceCode), poll(body.deviceCode)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(deps.mintKey).toHaveBeenCalledTimes(1);
  });

  it("deny answers access_denied and mints nothing", async () => {
    const { body } = await start();
    expect(await decide(body.userCode, false)).toEqual({ status: 200, body: { status: "denied" } });
    expect((await poll(body.deviceCode)).body.error).toBe("access_denied");
    expect(deps.mintKey).not.toHaveBeenCalled();
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.denied", target: `device:${body.userCode}` }));
  });

  it("expires after ten minutes, even once approved", async () => {
    const { body } = await start();
    await decide(body.userCode, true);
    tick(DEVICE_TTL_SEC * 1000 + 1);
    expect((await poll(body.deviceCode)).body.error).toBe("expired_token");
    expect(deps.mintKey).not.toHaveBeenCalled();
  });

  it("an unknown or malformed device code is expired or invalid", async () => {
    expect((await poll("x".repeat(43))).body.error).toBe("expired_token");
    const res = await routes.token(post("/api/v1/device/token", {}), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
});

describe("approve and lookup", () => {
  it("lookup shows the agent and machine, never the device code", async () => {
    const { body } = await start("codex", "build-box");
    const res = await routes.lookup(new Request(`https://spookyparticles.com/api/v1/device/approve?userCode=${body.userCode}`), undefined);
    const got = await res.json();
    expect(res.status).toBe(200);
    expect(got).toMatchObject({ userCode: body.userCode, client: "codex", clientLabel: "Codex", machine: "build-box", status: "pending" });
    expect(JSON.stringify(got)).not.toContain(body.deviceCode);
    expect(JSON.stringify(got)).not.toContain(sha256Hex(body.deviceCode));
  });

  it("requires a browser session: an API key is refused", async () => {
    const { body } = await start();
    actor = keyActor;
    const r = await decide(body.userCode, true);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("session_required");
    const look = await routes.lookup(new Request(`https://spookyparticles.com/api/v1/device/approve?userCode=${body.userCode}`), undefined);
    expect(look.status).toBe(403);
    actor = null;
    expect((await decide(body.userCode, true)).status).toBe(401);
    tick(5000);
    expect((await poll(body.deviceCode)).body.error).toBe("authorization_pending");
  });

  it("an unknown or expired code is a 404", async () => {
    expect((await decide("BCDF-GHJK", true)).status).toBe(404);
    expect((await decide("not a code", true)).status).toBe(404);
    const { body } = await start();
    tick(DEVICE_TTL_SEC * 1000 + 1);
    const r = await decide(body.userCode, true);
    expect(r.status).toBe(404);
    expect(r.body.error.message).toMatch(/expired/);
  });

  it("an approve sent from another site is refused", async () => {
    const { body } = await start();
    for (const site of ["cross-site", "same-site"]) {
      const res = await routes.approve(post("/api/v1/device/approve", { userCode: body.userCode, approve: true }, { "sec-fetch-site": site }), undefined);
      expect(res.status).toBe(403);
    }
    const ok = await routes.approve(post("/api/v1/device/approve", { userCode: body.userCode, approve: true }, { "sec-fetch-site": "same-origin" }), undefined);
    expect(ok.status).toBe(200);
  });

  it("a code is decided once; deny after approve is refused", async () => {
    const { body } = await start();
    await decide(body.userCode, true);
    expect((await decide(body.userCode, false)).status).toBe(409);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "device.approved", actor: "user:u_nate" }));
  });

  it("approve binds the key to the approving user", async () => {
    const { body } = await start();
    actor = { ...session, userId: "u_other", label: "user:u_other" };
    await decide(body.userCode, true);
    tick(5000);
    await poll(body.deviceCode);
    expect(deps.mintKey).toHaveBeenCalledWith("u_other", expect.any(String));
  });

  it("approve still lands when a poll rewrote the row in between", async () => {
    const { body } = await start();
    const realCas = store.compareAndSet;
    let first = true;
    store.compareAndSet = async (...args) => {
      if (first) {
        first = false;
        return false; // a poll won the race once
      }
      return realCas(...args);
    };
    expect((await decide(body.userCode, true)).body.status).toBe("approved");
  });
});
