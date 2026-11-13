/**
 * Header-only classifier for Tier 0. No bodies, no model.
 *
 * Decision order (first match wins):
 *
 * 0. Spooky Particles' own mail (alerts, digests): skip ("own"). Reading our
 *    own alert back in would count every failure twice.
 * 1. Threads the person sent: skip ("sent").
 * 2. Gmail social or forum category, or a known chatter address such as
 *    GitHub PR notifications: skip ("social" or "forum").
 * 3. Shops, shipping, restaurants, banks, brokerages, travel and consumer apps
 *    (src/consumer.ts), or a subject about a shipment, a trade or a bank
 *    statement, from anyone not in the sender table: skip ("consumer"). This is
 *    what Gmail's "purchases" category is mostly made of.
 * 4. Work out the signals: known sender, receipt subject, ops subject,
 *    invoice-looking attachment.
 * 5. A list-unsubscribe header, or the promotions category, with no subject or
 *    attachment signal: skip ("newsletter"), even from a known sender. Vendor
 *    marketing shares domains with billing mail; receipts and alerts carry a
 *    signal in the subject, marketing does not.
 * 6. Candidate, with reason known_sender, then receipt_subject, then
 *    ops_subject, then attachment.
 *
 * Subject signals are ignored for replies and forwards ("Re:", "Fwd:") and for
 * mail from consumer mailbox providers (gmail.com and friends): a person
 * writing "invoice" is not a billing system. Known-sender and attachment
 * signals still apply.
 */

import { SENDERS, type KnownSender } from './senders.ts';
import { REPLY_PREFIX_RE, hasInvoiceAttachment, hasOpsSignal, hasReceiptSignal } from './patterns.ts';
import { consumerKind, hasConsumerSubject } from './consumer.ts';

export interface Header {
  from: string;
  replyTo?: string;
  subject: string;
  listUnsubscribe?: boolean;
  /** Gmail label ids such as SENT, CATEGORY_SOCIAL, CATEGORY_FORUMS, CATEGORY_PROMOTIONS. */
  labels?: string[];
  attachmentNames?: string[];
  isSent?: boolean;
}

export type Reason = 'known_sender' | 'receipt_subject' | 'ops_subject' | 'attachment' | 'none';
export type SkipReason = 'own' | 'sent' | 'newsletter' | 'social' | 'forum' | 'consumer';

export interface Classification {
  candidate: boolean;
  reason: Reason;
  vendor?: string;
  category?: string;
  skipReason?: SkipReason;
}

/** Consumer mailbox providers. Billing systems do not send from these. */
export const FREEMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'qq.com',
  '163.com',
]);

// --- address handling -------------------------------------------------------

/** Pull the bare lowercase address out of a From header value. */
export function parseAddress(raw: string | undefined): { address: string; domain: string; name: string } | undefined {
  if (!raw) return undefined;
  const angle = /<([^<>]+)>/.exec(raw);
  const candidate = (angle?.[1] ?? raw).trim().replace(/^"|"$/g, '');
  const m = /([^\s<>"',;()]+@[^\s<>"',;()]+)/.exec(candidate);
  if (!m?.[1]) return undefined;
  const address = normalizeAddress(m[1]);
  const at = address.lastIndexOf('@');
  if (at < 1) return undefined;
  const name = angle ? raw.slice(0, angle.index).trim().replace(/^"|"$/g, '').trim() : '';
  return { address, domain: address.slice(at + 1), name };
}

/** Lowercase, drop surrounding punctuation, and strip a +tag from the local part. */
export function normalizeAddress(address: string): string {
  const lower = address.trim().toLowerCase().replace(/[>.;,]+$/, '');
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;
  const local = lower.slice(0, at);
  const plus = local.indexOf('+');
  return (plus > 0 ? local.slice(0, plus) : local) + lower.slice(at);
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

/** Domains Spooky Particles sends from. Its own alerts are never a vendor's signal. */
export const OWN_DOMAINS: readonly string[] = ['spookyparticles.com', 'spookyparticles.ai'];

/** True for mail Spooky Particles sent (any subdomain of its domains). */
export function isOwnMail(from: string | undefined): boolean {
  const host = parseAddress(from)?.domain;
  return Boolean(host && OWN_DOMAINS.some((d) => domainMatches(host, d)));
}

// --- sender index -----------------------------------------------------------

interface Index {
  byAddress: Map<string, KnownSender>;
  domains: { domain: string; sender: KnownSender }[];
  skip: Set<string>;
}

function buildIndex(senders: readonly KnownSender[]): Index {
  const byAddress = new Map<string, KnownSender>();
  const domains: { domain: string; sender: KnownSender }[] = [];
  const skip = new Set<string>();
  for (const s of senders) {
    for (const a of s.addresses) {
      const key = normalizeAddress(a);
      if (!byAddress.has(key)) byAddress.set(key, s);
    }
    for (const d of s.domains) domains.push({ domain: d.toLowerCase(), sender: s });
    for (const a of s.skipAddresses ?? []) skip.add(normalizeAddress(a));
  }
  // Longest domain first so "notify.cloudflare.com" wins over "cloudflare.com".
  domains.sort((x, y) => y.domain.length - x.domain.length || x.domain.localeCompare(y.domain));
  return { byAddress, domains, skip };
}

const INDEX = buildIndex(SENDERS);

/** Look up the known sender for an address (plus-tags ignored, subdomains match). */
export function findSender(address: string): KnownSender | undefined {
  const index = INDEX;
  const norm = normalizeAddress(address);
  const direct = index.byAddress.get(norm);
  if (direct) return direct;
  const host = norm.slice(norm.lastIndexOf('@') + 1);
  for (const { domain, sender } of index.domains) {
    if (domainMatches(host, domain)) return sender;
  }
  return undefined;
}

// Vendor names that are ordinary words; never trust them in a display name.
const GENERIC_NAMES = new Set(['make', 'linear', 'render', 'bolt', 'neon', 'expo', 'loom', 'cursor']);

/**
 * A processor (Stripe, Paddle, ...) sends on behalf of a vendor. Try Reply-To,
 * then the display name, to name the real vendor.
 */
function resolveBehindProcessor(
  processor: KnownSender,
  replyTo: string | undefined,
  displayName: string,
): KnownSender {
  const reply = parseAddress(replyTo);
  if (reply) {
    const s = findSender(reply.address);
    if (s && s.category !== 'payments_processor') return s;
  }
  const name = displayName.toLowerCase();
  if (name) {
    for (const s of SENDERS) {
      if (s.category === 'payments_processor') continue;
      const v = s.vendor.toLowerCase();
      if (v.length < 5 || GENERIC_NAMES.has(v)) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
      if (re.test(name)) return s;
    }
  }
  return processor;
}

// --- classifier -------------------------------------------------------------

const NONE: Classification = { candidate: false, reason: 'none' };

export function classifyHeader(h: Header): Classification {
  const labels = new Set((h.labels ?? []).map((l) => l.toUpperCase()));
  const from = parseAddress(h.from);

  // 0. Our own alerts and digests.
  if (isOwnMail(h.from)) return { ...NONE, skipReason: 'own' };

  // 1. Threads the person sent.
  if (h.isSent || labels.has('SENT')) {
    return { ...NONE, skipReason: 'sent' };
  }

  // 2. Social, forums, and known chatter addresses.
  if (labels.has('CATEGORY_SOCIAL')) return { ...NONE, skipReason: 'social' };
  if (labels.has('CATEGORY_FORUMS')) return { ...NONE, skipReason: 'forum' };
  if (from && INDEX.skip.has(from.address)) return { ...NONE, skipReason: 'forum' };

  // 3. Signals.
  let known = from ? findSender(from.address) : undefined;
  if (known && from && known.category === 'payments_processor') {
    known = resolveBehindProcessor(known, h.replyTo, from.name);
  }

  // 3b. Consumer commerce and finance: never a bill this product tracks.
  if (!known && ((from && consumerKind(from.address)) || hasConsumerSubject(h.subject))) {
    return { ...NONE, skipReason: 'consumer' };
  }

  const human =
    REPLY_PREFIX_RE.test(h.subject) || (from !== undefined && FREEMAIL_DOMAINS.has(from.domain));
  const receipt = !human && hasReceiptSignal(h.subject);
  const ops = !human && hasOpsSignal(h.subject);
  const attachment = hasInvoiceAttachment(h.attachmentNames);

  // 4. Newsletters: unsubscribe header or promotions with nothing billing-shaped.
  const bulk = h.listUnsubscribe === true || labels.has('CATEGORY_PROMOTIONS');
  if (bulk && !receipt && !ops && !attachment) {
    return { ...NONE, skipReason: 'newsletter' };
  }

  // 5. Candidate.
  if (known) {
    return { candidate: true, reason: 'known_sender', vendor: known.vendor, category: known.category };
  }
  if (receipt) return { candidate: true, reason: 'receipt_subject' };
  if (ops) return { candidate: true, reason: 'ops_subject' };
  if (attachment) return { candidate: true, reason: 'attachment' };
  return NONE;
}
