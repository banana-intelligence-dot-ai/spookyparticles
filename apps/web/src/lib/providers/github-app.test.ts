import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAppJwt, createGithubApp, decodePrivateKey, permissionNames } from "./github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("createAppJwt", () => {
  it("signs RS256 with iat 60s back, exp 9 minutes ahead, iss = app id", () => {
    const nowMs = Date.UTC(2026, 10, 2, 12, 0, 0);
    const jwt = createAppJwt("123456", privateKey, nowMs);
    const [h, p, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const now = nowMs / 1000;
    expect(decode(p)).toEqual({ iat: now - 60, exp: now + 540, iss: "123456" });
    // Total lifetime stays within GitHub's 10 minute maximum.
    expect(decode(p).exp - decode(p).iat).toBeLessThanOrEqual(600);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    expect(verifier.verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("fails verification when the payload is changed", () => {
    const [h, , s] = createAppJwt("1", privateKey).split(".");
    const forged = Buffer.from(JSON.stringify({ iat: 0, exp: 9e9, iss: "1" })).toString("base64url");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${forged}`);
    expect(verifier.verify(publicKey, Buffer.from(s, "base64url"))).toBe(false);
  });
});

describe("decodePrivateKey", () => {
  it("accepts base64 of the PEM and a raw PEM", () => {
    expect(decodePrivateKey(Buffer.from(privateKey).toString("base64"))).toBe(privateKey.trim());
    expect(decodePrivateKey(privateKey)).toBe(privateKey.trim());
  });
  it("rejects anything else", () => {
    expect(() => decodePrivateKey("bm90IGEga2V5")).toThrow(/PEM/);
  });
});

describe("permissionNames", () => {
  it("flattens and sorts", () => {
    expect(permissionNames({ metadata: "read", deployments: "read" })).toEqual(["deployments:read", "metadata:read"]);
    expect(permissionNames(null)).toEqual([]);
  });
});

describe("installation token cache", () => {
  function setup() {
    let clock = Date.UTC(2026, 10, 2, 12, 0, 0);
    const calls: { url: string; method: string; auth: string }[] = [];
    let n = 0;
    const fetchStub = (async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), method: init?.method ?? "GET", auth: headers.authorization });
      if (String(url).endsWith("/app/installations/42/access_tokens")) {
        n += 1;
        return Response.json(
          { token: `ghs_test_${n}`, expires_at: new Date(clock + 60 * 60 * 1000).toISOString() },
          { status: 201 },
        );
      }
      if (String(url).endsWith("/app/installations/404/access_tokens")) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const app = createGithubApp({ appId: "7", privateKeyPem: privateKey, fetch: fetchStub, now: () => clock });
    return { app, calls, advance: (ms: number) => (clock += ms) };
  }

  it("mints once and reuses the token until 5 minutes before expiry", async () => {
    const { app, calls, advance } = setup();
    expect(await app.installationToken(42)).toBe("ghs_test_1");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].auth.startsWith("Bearer ey")).toBe(true);

    advance(54 * 60 * 1000);
    expect(await app.installationToken("42")).toBe("ghs_test_1");
    expect(calls).toHaveLength(1);

    advance(2 * 60 * 1000); // 56 minutes in: inside the 5 minute margin
    expect(await app.installationToken(42)).toBe("ghs_test_2");
    expect(calls).toHaveLength(2);
  });

  it("drops the cached token when the installation is deleted", async () => {
    const { app, calls } = setup();
    await app.installationToken(42);
    const r = await app.deleteInstallation(42);
    expect(r).toEqual({ ok: true, status: 202 });
    await app.installationToken(42);
    expect(calls.filter((c) => c.url.endsWith("/access_tokens"))).toHaveLength(2);
  });

  it("surfaces 404 with its status so callers can mark the connection", async () => {
    const { app } = setup();
    await expect(app.installationToken(404)).rejects.toMatchObject({ status: 404 });
  });
});
