import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, keyIdFor, keyringFromEnv, parseMasterKey } from "./crypto";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round-trips a token and records the key id", () => {
    const ring = keyringFromEnv({ SP_MASTER_KEY: keyA });
    const sealed = encrypt("gho_example_token", ring);
    expect(sealed.keyId).toBe(keyIdFor(Buffer.from(keyA, "base64")));
    expect(sealed.ciphertext).not.toContain("gho_example_token");
    expect(sealed.ciphertext.startsWith(`v1.${sealed.keyId}.`)).toBe(true);
    expect(decrypt(sealed.ciphertext, ring)).toBe("gho_example_token");
  });

  it("uses a fresh IV every time", () => {
    const ring = keyringFromEnv({ SP_MASTER_KEY: keyA });
    expect(encrypt("same", ring).ciphertext).not.toBe(encrypt("same", ring).ciphertext);
  });

  it("rejects tampered ciphertext", () => {
    const ring = keyringFromEnv({ SP_MASTER_KEY: keyA });
    const parts = encrypt("secret", ring).ciphertext.split(".");
    const ct = Buffer.from(parts[4], "base64url");
    ct[0] ^= 1;
    parts[4] = ct.toString("base64url");
    expect(() => decrypt(parts.join("."), ring)).toThrow();
  });

  it("rejects a swapped key id", () => {
    const ringA = keyringFromEnv({ SP_MASTER_KEY: keyA, SP_MASTER_KEY_PREVIOUS: keyB });
    const parts = encrypt("secret", ringA).ciphertext.split(".");
    parts[1] = keyIdFor(Buffer.from(keyB, "base64"));
    expect(() => decrypt(parts.join("."), ringA)).toThrow();
  });

  it("decrypts rows sealed by a previous key during rotation", () => {
    const oldRing = keyringFromEnv({ SP_MASTER_KEY: keyA });
    const sealed = encrypt("old-token", oldRing);
    const rotated = keyringFromEnv({ SP_MASTER_KEY: keyB, SP_MASTER_KEY_PREVIOUS: keyA });
    expect(decrypt(sealed.ciphertext, rotated)).toBe("old-token");
    expect(encrypt("new", rotated).keyId).toBe(keyIdFor(Buffer.from(keyB, "base64")));
  });

  it("fails without the key that sealed it", () => {
    const sealed = encrypt("x", keyringFromEnv({ SP_MASTER_KEY: keyA }));
    const other = keyringFromEnv({ SP_MASTER_KEY: keyB });
    expect(() => decrypt(sealed.ciphertext, other)).toThrow(/no key/);
  });

  it("validates the master key", () => {
    expect(() => parseMasterKey(undefined)).toThrow(/not set/);
    expect(() => parseMasterKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
