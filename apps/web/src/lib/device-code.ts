/** Agent sign-in user codes. No server imports, so the /link page uses the same rules. */

/** RFC 8628 section 6.1: consonants only (no accidental words), minus L. No digits, so no 0 O 1 I mixups. */
export const USER_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ";
export const USER_CODE_LENGTH = 8;

export function formatUserCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Accepts any case, with or without the dash or spaces. Returns ABCD-EFGH, or null if it cannot be a code. */
export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  if (raw.length !== USER_CODE_LENGTH) return null;
  for (const ch of raw) if (!USER_CODE_ALPHABET.includes(ch)) return null;
  return formatUserCode(raw);
}
