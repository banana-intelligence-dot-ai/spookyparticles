/**
 * The @spookyparticles posting step, pure parts: which line goes next and the checks it must pass.
 * No database and no network here, so the dry run and the tests use exactly what the watcher uses.
 *
 * The account only posts. Nothing in this folder replies, follows, likes, reposts or sends messages.
 */
import { createHmac, randomBytes } from "node:crypto";
import { X_POST_BANNED_PATTERNS } from "./private-terms";
import queueFile from "./queue.json";

/**
 * The switch. Daily posting is a reviewed commit, made only after the first post went out clean.
 * Before that, posting is on for the one day of the first post and off every other day.
 * Since Nov 23 each day's post is the overnight count (overnight.ts); the queue fills days it cannot be computed.
 */
export const X_POSTING_DAILY = true;
export const X_FIRST_POST_DAY = "2026-11-21";
export function xPostingOn(nowMs: number): boolean {
  return X_POSTING_DAILY || pacificDay(nowMs) === X_FIRST_POST_DAY;
}
/** Any watcher run in this Pacific hour may post, winter and summer; the day's claim makes it once. */
export const X_POST_HOUR_PT = 9;
/** The hour of the day in Pacific time. */
export function pacificHour(nowMs: number): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date(nowMs)));
}
/** The Pacific calendar date, YYYY-MM-DD: the posting day, so 4pm to midnight Pacific is still today. */
export function pacificDay(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}
/**
 * The daily post's own check-in on our account, so Spooky watches its own X account: an ok ping only
 * when the overnight count posted with an id from X, a fail ping with the reason on any other outcome.
 */
export const X_CHECKIN_NAME = "X daily post (@spookyparticles)";
export const X_KEY_NAMES = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"] as const;

/** The Artifact News account's posted texts, read before every post. 404 or [] is no posts; any other failure skips the day. */
export const ARTIFACT_NEWS_LOG_URL = "https://artifactnews.ai/x-posted.json";

/** The shape both accounts publish: a JSON array of strings (an array of {"text"} objects is accepted). Null when it is anything else. */
export function parsePostedLog(body: unknown): string[] | null {
  if (!Array.isArray(body)) return null;
  const out: string[] = [];
  for (const v of body) {
    const text = typeof v === "string" ? v : typeof (v as { text?: unknown })?.text === "string" ? (v as { text: string }).text : null;
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

export type QueueLine = { text: string; checked: string; source: string };
export const QUEUE: QueueLine[] = queueFile.lines;

export type Check = { name: string; ok: boolean; detail?: string };
export type Plan =
  | { action: "post"; text: string; checks: Check[] }
  | { action: "skip"; reason: "off" | "empty" | "keys_missing" | "keys_wrong_kind" | "check_failed"; text: string | null; checks: Check[] };

const BANNED = X_POST_BANNED_PATTERNS.map((pattern) => new RegExp(pattern, "i"));
const LINK = [/https?:\/\//i, /\bwww\./i, /\b[a-z0-9-]+\.(com|ai|io|dev|app|so|co|net|org|sh|xyz|gg|me|news|link|ly)\b/i];

/** Text only: one line, no link (X prices a link post at more than ten times a plain one), no mention, house words. */
export function lineChecks(text: string): Check[] {
  return [
    { name: "one line, 1 to 280 characters", ok: text.trim().length > 0 && text.length <= 280 && !/[\r\n]/.test(text) },
    { name: "no link", ok: !LINK.some((re) => re.test(text)) },
    { name: "no mention", ok: !/(^|[^\w])@\w/.test(text) },
    { name: "no em or en dash", ok: !/[–—]/.test(text) },
    { name: "no banned words", ok: !BANNED.some((re) => re.test(text)), detail: BANNED.find((re) => re.test(text))?.source },
  ];
}

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/** Same words, or nearly: 60% of the distinct words shared, the rule both accounts use. Order and punctuation do not save a repeat. */
export function nearIdentical(a: string, b: string): boolean {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared) >= 0.6;
}

/**
 * The next line and whether it may post. `posted` is everything this account posted by this step;
 * `others` is what the Artifact News account posted, or null when its log could not be read (fails closed).
 */
export function planXPost(input: { on: boolean; keysPresent: boolean; keysWrongKind?: boolean; queue: QueueLine[]; posted: string[]; others: string[] | null; overnight?: string | null }): Plan {
  // The overnight count leads each day; a queued feature line goes out on a day the count could not be computed.
  const lead = input.overnight ?? null;
  const next = lead ? { text: lead } : input.queue.find((l) => !input.posted.some((p) => p.trim() === l.text.trim())) ?? null;
  if (!input.on) return { action: "skip", reason: "off", text: next?.text ?? null, checks: [] };
  if (!next) return { action: "skip", reason: "empty", text: null, checks: [] };
  const others: Check = input.others === null
    ? { name: "not near-identical to Artifact News posts", ok: false, detail: `its log at ${ARTIFACT_NEWS_LOG_URL} could not be read` }
    : { name: "not near-identical to Artifact News posts", ok: !input.others.some((p) => nearIdentical(p, next.text)), detail: `${input.others.length} Artifact News posts read` };
  const checks: Check[] = lead
    ? [
      { name: "overnight count line", ok: /^Overnight on our own apps, Spooky Particles caught \d+ problems?\b.* Last 30 days: \d+ caught, \d+ back to green\b/.test(lead) },
      ...lineChecks(lead),
      // Each day's count shares most words with the last, so only an exact repeat is blocked; the date keeps days distinct.
      { name: "not already posted", ok: !input.posted.some((p) => p.trim() === lead.trim()) },
      others,
    ]
    : [
      { name: "in the checked queue", ok: input.queue.some((l) => l.text === next.text && /^\d{4}-\d{2}-\d{2}$/.test(l.checked) && l.source.length > 0) },
      ...lineChecks(next.text),
      { name: "not near-identical to this account's posts", ok: !input.posted.some((p) => nearIdentical(p, next.text)) },
      others,
    ];
  if (!input.keysPresent) return { action: "skip", reason: "keys_missing", text: next.text, checks };
  if (input.keysWrongKind) return { action: "skip", reason: "keys_wrong_kind", text: next.text, checks };
  if (checks.some((c) => !c.ok)) return { action: "skip", reason: "check_failed", text: next.text, checks };
  return { action: "post", text: next.text, checks };
}

/** RFC 3986 encoding, as OAuth 1.0a requires. */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type XKeys = { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string };

export type XKeysShape = "ok" | "missing" | "wrong_kind";

/**
 * Pure: whether the four values look like an OAuth 1.0a set, judged by shape only. An OAuth 1.0a
 * access token is "<account number>-<letters and digits>", about 50 characters; its secret about 45.
 * An OAuth 2.0 token (91 characters) in those slots made X answer 215 on Nov 20.
 */
export function xKeysShape(keys: XKeys | null): XKeysShape {
  if (!keys) return "missing";
  const { apiKey, apiSecret, accessToken, accessTokenSecret } = keys;
  // Letters and digits in a length band around X's own (25, 50, about 50, 45), wide enough not to block a good set.
  const fits = (v: string, min: number, max: number) => v.length >= min && v.length <= max && /^[A-Za-z0-9]+$/.test(v);
  const ok = fits(apiKey, 15, 40) && fits(apiSecret, 35, 64) && fits(accessTokenSecret, 30, 64) && accessToken.length <= 80 && /^\d+-[A-Za-z0-9]{10,}$/.test(accessToken);
  return ok ? "ok" : "wrong_kind";
}

/** OAuth 1.0a user-context header. `params` are query or form fields; a JSON body is not signed. */
export function oauthHeader(method: string, url: string, keys: XKeys, params: Record<string, string> = {}, nonce = randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000).toString()): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.accessToken,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const paramString = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramString)}`;
  const signature = createHmac("sha1", `${enc(keys.apiSecret)}&${enc(keys.accessTokenSecret)}`).update(base).digest("base64");
  const header = { ...oauth, oauth_signature: signature };
  return "OAuth " + Object.keys(header).sort().map((k) => `${enc(k)}="${enc(header[k as keyof typeof header])}"`).join(", ");
}

/** Reads a sibling account's posted texts. 404 means no posts yet; any other failure is null, so the check fails closed. */
export async function fetchPostedLog(url = ARTIFACT_NEWS_LOG_URL): Promise<string[] | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return [];
    return res.ok ? parsePostedLog(await res.json()) : null;
  } catch {
    return null;
  }
}

export type XAnswer = { data?: { id?: string }; title?: string; detail?: string; errors?: { code?: number; message?: string }[] };

/** Pure: X's own words for a refusal, with its error codes (32 bad signature or key pair, 89 bad token). Holds no key. */
export function xRefusal(status: number, body: XAnswer | null): string {
  const parts = [body?.title, body?.detail && body.detail !== body.title ? body.detail : null, ...(body?.errors ?? []).map((e) => [e.code, e.message].filter((x) => x !== undefined).join(" "))].filter(Boolean);
  return `X answered ${status}${parts.length ? `: ${parts.join("; ")}` : ""}`;
}
