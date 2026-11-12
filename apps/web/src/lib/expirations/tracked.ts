import { ApiError } from "@/lib/http";
import type { TrackedExpirationKind } from "./expirations";

export type TrackedExpirationInput = {
  kind: TrackedExpirationKind;
  name: string;
  provider: string | null;
  hint: string | null;
  project: string | null;
  expiresOn: string;
};

const KINDS: TrackedExpirationKind[] = ["api_key", "token", "certificate", "other"];
const SECRET_PREFIX = /(?:^|\s)(?:bearer\s+|sp_|sk-ant-|sk-(?:live|test)-|pk_(?:live|test)_|gh[pousr]_|github_pat_|xox[baprs]-|AKIA|ASIA|AIza)[A-Za-z0-9_./+=-]+/i;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
/** A random token has one long run of letters and digits; a name like STRIPE_SECRET_KEY_PROD_2026 is short words. */
const RANDOM_RUN = /[A-Za-z0-9+=]{20,}/g;
const looksRandom = (run: string) => /[A-Za-z]/.test(run) && /\d/.test(run);

export function looksLikeSecret(value: string): boolean {
  return SECRET_PREFIX.test(value) || JWT.test(value) || (value.match(RANDOM_RUN) ?? []).some(looksRandom);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function expirationId(value: string): string {
  if (!UUID.test(value)) throw new ApiError(404, "not_found", "Expiration not found");
  return value;
}

/** A real calendar date, YYYY-MM-DD, from 2000 through 2100. */
export function dateOnlyInput(value: unknown, field = "expiresOn"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "expires_on", `${field}: a date in YYYY-MM-DD form`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < "2000-01-01" || value > "2100-12-31") {
    throw new ApiError(400, "expires_on", `${field}: a real date from 2000 through 2100`);
  }
  return value;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, field, `${field}: required`);
    return null;
  }
  if (typeof value !== "string") throw new ApiError(400, field, `${field}: text only`);
  const clean = value.trim();
  if (!clean && required) throw new ApiError(400, field, `${field}: required`);
  if (clean.length > max) throw new ApiError(400, field, `${field}: up to ${max} characters`);
  if (looksLikeSecret(clean)) throw new ApiError(400, "secret_value", `${field}: looks like a secret value; send only a name or short hint`);
  return clean || null;
}

export function trackedExpirationInput(value: unknown): TrackedExpirationInput {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof body.kind !== "string" || !KINDS.includes(body.kind as TrackedExpirationKind)) {
    throw new ApiError(400, "kind", "kind: api_key, token, certificate or other");
  }
  const name = text(body.name, "name", 80, true)!;
  const provider = text(body.provider, "provider", 40);
  const hint = text(body.hint, "hint", 6);
  const project = text(body.project, "project", 120);
  const expiresOn = dateOnlyInput(body.expiresOn);
  return { kind: body.kind as TrackedExpirationKind, name, provider, hint, project, expiresOn };
}

/** Hints are display-only and must never enter the audit log. */
export function expirationAuditFields(value: TrackedExpirationInput) {
  return { kind: value.kind, name: value.name, provider: value.provider, project: value.project, expiresOn: value.expiresOn };
}
