/**
 * Token encryption at rest: AES-256-GCM with a 32-byte master key from
 * SP_MASTER_KEY (base64). Every ciphertext carries the key id that sealed it, so
 * keys can rotate: add the new key, re-encrypt rows whose key_id is old, retire it.
 *
 * Envelope format (a single string, safe for a text column):
 *   v1.<keyId>.<iv b64url>.<tag b64url>.<ciphertext b64url>
 *
 * Plaintext never leaves this module except as the return value of decrypt().
 * Never log either side.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export type Keyring = { currentKeyId: string; keys: Map<string, Buffer> };

/** Derive a short, non-secret id for a key so rows record which key sealed them. */
export function keyIdFor(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function parseMasterKey(b64: string | undefined): Buffer {
  if (!b64) throw new Error("SP_MASTER_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("SP_MASTER_KEY must be 32 bytes, base64 encoded");
  return key;
}

/**
 * Current key from SP_MASTER_KEY; optional retired keys from SP_MASTER_KEY_PREVIOUS
 * (comma-separated base64) so old rows still decrypt during a rotation.
 */
export function keyringFromEnv(env: Record<string, string | undefined> = process.env): Keyring {
  const current = parseMasterKey(env.SP_MASTER_KEY);
  const keys = new Map<string, Buffer>([[keyIdFor(current), current]]);
  for (const old of (env.SP_MASTER_KEY_PREVIOUS ?? "").split(",").filter(Boolean)) {
    const k = parseMasterKey(old.trim());
    keys.set(keyIdFor(k), k);
  }
  return { currentKeyId: keyIdFor(current), keys };
}

export type Sealed = { ciphertext: string; keyId: string };

export function encrypt(plaintext: string, keyring: Keyring = keyringFromEnv()): Sealed {
  const key = keyring.keys.get(keyring.currentKeyId);
  if (!key) throw new Error("current key missing from keyring");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  // Bind the key id and version as associated data so they cannot be swapped.
  cipher.setAAD(Buffer.from(`${VERSION}.${keyring.currentKeyId}`));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [VERSION, keyring.currentKeyId, b64u(iv), b64u(tag), b64u(ct)].join("."),
    keyId: keyring.currentKeyId,
  };
}

export function decrypt(envelope: string, keyring: Keyring = keyringFromEnv()): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) throw new Error("unrecognized ciphertext format");
  const [, keyId, iv, tag, ct] = parts;
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`no key for key id ${keyId}`);
  const decipher = createDecipheriv("aes-256-gcm", key, unb64u(iv));
  decipher.setAAD(Buffer.from(`${VERSION}.${keyId}`));
  decipher.setAuthTag(unb64u(tag));
  return Buffer.concat([decipher.update(unb64u(ct)), decipher.final()]).toString("utf8");
}

/** Convenience for nullable columns. */
export function encryptOptional(plaintext: string | null | undefined, keyring?: Keyring) {
  return plaintext ? encrypt(plaintext, keyring).ciphertext : null;
}

/** SHA-256 hex, used for API key hashing. Not for passwords. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return b64u(randomBytes(bytes));
}

function b64u(buf: Buffer): string {
  return buf.toString("base64url");
}
function unb64u(s: string): Buffer {
  return Buffer.from(s, "base64url");
}
