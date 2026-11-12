/**
 * From a full Gmail message to what the reading pipeline needs: plain text,
 * the sender's authentication result, and a template fingerprint. Pure
 * functions, unit tested. The body text exists only inside the step that
 * called this; nothing here writes anywhere.
 */
import { createHash } from "node:crypto";

export type GmailFullPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailFullPart[];
};

export type GmailFullMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: GmailFullPart;
};

/** What the pipeline sees of one email. Trimmed before it reaches a model. */
export type EmailText = {
  from: string | null;
  fromAddress: string | null;
  fromDomain: string | null;
  replyTo: string | null;
  subject: string | null;
  date: Date | null;
  /** Plain text: the text/plain part when present, else the HTML part with tags removed. */
  text: string;
  /** Raw HTML when the message had an HTML part; used for the fingerprint only. */
  html: string | null;
  attachmentNames: string[];
  auth: SenderAuth;
};

export type SenderAuth = {
  dkim: "pass" | "fail" | "none";
  dmarc: "pass" | "fail" | "none";
  spf: "pass" | "fail" | "none";
  /** The domain DKIM signed for, when the header says. */
  dkimDomain: string | null;
  /** True when DKIM or DMARC passed and the signing domain aligns with the From domain. */
  verified: boolean;
};

export function header(part: GmailFullPart | undefined, name: string): string | null {
  const h = part?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const v = h?.value?.trim();
  return v ? v : null;
}

/** "Vercel <invoice+statements@vercel.com>" to "invoice+statements@vercel.com". */
export function addressOf(from: string | null): string | null {
  if (!from) return null;
  const m = /<([^>]+)>/.exec(from);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(raw) ? raw : null;
}

export function domainOf(address: string | null): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1) : null;
}

/** example.com aligns with mail.example.com (relaxed alignment, like DMARC). */
export function domainsAlign(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const org = (d: string) => d.split(".").slice(-2).join(".");
  return org(a) === org(b);
}

/**
 * Gmail writes its verdict into Authentication-Results, e.g.
 * "mx.google.com; dkim=pass header.i=@vercel.com header.s=...; spf=pass ...; dmarc=pass (p=REJECT) header.from=vercel.com".
 * A forged message cannot carry a passing verdict because Gmail adds the header itself.
 */
export function parseAuthResults(value: string | null, fromDomain: string | null): SenderAuth {
  const none: SenderAuth = { dkim: "none", dmarc: "none", spf: "none", dkimDomain: null, verified: false };
  if (!value) return none;
  const v = value.toLowerCase();
  const verdict = (mech: string): "pass" | "fail" | "none" => {
    const m = new RegExp(`(?:^|[;\\s])${mech}=(\\w+)`).exec(v);
    if (!m) return "none";
    return m[1] === "pass" ? "pass" : "fail";
  };
  const dkim = verdict("dkim");
  const dmarc = verdict("dmarc");
  const spf = verdict("spf");
  const dkimDomain = /dkim=pass[^;]*header\.(?:i=@|d=)([a-z0-9.-]+)/.exec(v)?.[1] ?? null;
  const dmarcFrom = /dmarc=pass[^;]*header\.from=([a-z0-9.-]+)/.exec(v)?.[1] ?? null;
  const verified =
    (dmarc === "pass" && (!dmarcFrom || domainsAlign(dmarcFrom, fromDomain))) ||
    (dkim === "pass" && domainsAlign(dkimDomain, fromDomain));
  return { dkim, dmarc, spf, dkimDomain, verified };
}

export function decodeBody(data: string | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function walk(part: GmailFullPart | undefined, visit: (p: GmailFullPart) => void): void {
  if (!part) return;
  visit(part);
  for (const p of part.parts ?? []) walk(p, visit);
}

/** HTML to readable text: drop scripts and styles, keep line breaks at block edges, decode entities. */
export function htmlToText(html: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return entities[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * A structural hash of the HTML: tag names in order, text removed, attribute
 * values removed. Two emails from the same vendor template hash the same even
 * though amounts and dates differ. Combined with the sender address.
 */
export function templateFingerprint(fromAddress: string | null, html: string | null, subject?: string | null): string | null {
  if (!fromAddress) return null;
  if (html) {
    const skeleton = (html.match(/<\/?[a-z][a-z0-9-]*/gi) ?? [])
      .map((t) => t.toLowerCase())
      .filter((t) => !/^<\/?(span|b|i|strong|em|br|font)$/.test(t))
      .join("");
    const hash = createHash("sha256").update(skeleton).digest("hex").slice(0, 16);
    return `${fromAddress}#${hash}`;
  }
  // Plain-text mail: the subject with numbers, amounts and ids blanked is the template.
  if (!subject) return null;
  const shape = subject
    .toLowerCase()
    .replace(/[#:]?\s*[a-z0-9_-]*\d[a-z0-9_-]*/g, " #")
    .replace(/\s+/g, " ")
    .trim();
  const hash = createHash("sha256").update(shape).digest("hex").slice(0, 16);
  return `${fromAddress}#s${hash}`;
}

export function toEmailText(msg: GmailFullMessage): EmailText {
  const top = msg.payload;
  const from = header(top, "From");
  const fromAddress = addressOf(from);
  const fromDomain = domainOf(fromAddress);
  let plain = "";
  let html: string | null = null;
  const attachmentNames: string[] = [];
  walk(top, (p) => {
    const mime = (p.mimeType ?? "").toLowerCase();
    if (p.filename) attachmentNames.push(p.filename);
    if (mime === "text/plain" && p.body?.data && !plain) plain = decodeBody(p.body.data);
    if (mime === "text/html" && p.body?.data && !html) html = decodeBody(p.body.data);
  });
  const text = (plain.trim() ? plain : html ? htmlToText(html) : (msg.snippet ?? "")).trim();
  const rawDate = header(top, "Date");
  let date: Date | null = rawDate ? new Date(rawDate) : null;
  if (!date || Number.isNaN(date.getTime())) {
    date = msg.internalDate && /^\d+$/.test(msg.internalDate) ? new Date(Number(msg.internalDate)) : null;
  }
  return {
    from,
    fromAddress,
    fromDomain,
    replyTo: header(top, "Reply-To"),
    subject: header(top, "Subject"),
    date,
    text,
    html,
    attachmentNames,
    auth: parseAuthResults(header(top, "Authentication-Results"), fromDomain),
  };
}

/** The slice a model sees: the start of the text, cut at a line, with a note when cut. */
export function trimForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  const head = text.slice(0, cut > maxChars * 0.6 ? cut : maxChars);
  return `${head}\n[… ${text.length - head.length} more characters not shown]`;
}
