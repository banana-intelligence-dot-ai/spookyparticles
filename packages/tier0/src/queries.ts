/**
 * Gmail server-side search strings for the Tier 0 fast path.
 *
 * Length cap. Google documents no maximum length for a Gmail search query
 * (the Gmail API `q` parameter and the web search box both take the same
 * syntax). The only measured number we found is for filter criteria: a
 * 2024-04-19 test by Spudart packed `from:` addresses joined with OR into one
 * Gmail filter and found that criteria under 1,469 characters saved and
 * criteria over 1,488 characters were rejected
 * (https://www.spudart.org/blog/character-limit-for-gmail-filter/). Filters
 * and search share the query parser, but that is an assumption, not a
 * documented fact. We therefore default to 1,400 characters per query, which
 * sits under the lower bound with a margin, and let callers lower it.
 *
 * Domain matching. Gmail's `from:example.com` is documented for addresses at
 * that domain; whether it also matches subdomains is not documented. The
 * sender table lists known sending subdomains explicitly (for example
 * `mail.vercel.com`), so we do not rely on it.
 */

import { SENDERS, type KnownSender, type SenderCategory } from './senders.ts';
import { ATTACHMENT_TERMS, OPS_TERMS, RECEIPT_TERMS, type Lang } from './patterns.ts';

export const DEFAULT_NEWER_THAN = '2y';
export const DEFAULT_MAX_QUERY_LENGTH = 1400;
const MIN_MAX_QUERY_LENGTH = 200;

export interface GmailQueryOptions {
  /** Gmail relative age: a number plus d, m or y. Default "2y". */
  newerThan?: string;
  /** Hard cap per query string, in characters. Default 1400. */
  maxQueryLength?: number;
  /**
   * Leave promotions out of the subject-term queries (default true). Sender
   * queries are never filtered by category.
   */
  excludePromotions?: boolean;
}

const CATEGORY_ORDER: SenderCategory[] = [
  'hosting',
  'database',
  'domains',
  'dns_cdn',
  'ai',
  'payments_processor',
  'dev_tools',
  'saas',
];

const LANG_ORDER: Lang[] = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'ja'];

function quote(term: string): string {
  return /[\s'"]/u.test(term) ? `"${term.replace(/"/g, '')}"` : term;
}

function orderedSenders(senders: readonly KnownSender[]): KnownSender[] {
  return [...senders].sort((a, b) => {
    const c = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return c !== 0 ? c : a.vendor.localeCompare(b.vendor, 'en');
  });
}

function domainCovers(domains: Set<string>, address: string): boolean {
  const host = address.slice(address.indexOf('@') + 1);
  return domains.has(host);
}

/**
 * The values to put inside `from:( ... )`: every domain, then every address
 * whose domain is not already in the list. Addresses containing `+` are left
 * out (plus-addressing is covered by the domain). De-duplicated, ordered by
 * category then vendor name, domains before addresses within a vendor.
 */
export function fromTerms(senders: readonly KnownSender[] = SENDERS): string[] {
  const ordered = orderedSenders(senders);
  const allDomains = new Set(ordered.flatMap((s) => s.domains.map((d) => d.toLowerCase())));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  for (const s of ordered) {
    for (const d of [...s.domains].map((x) => x.toLowerCase()).sort()) push(d);
    for (const a of [...s.addresses].map((x) => x.toLowerCase()).sort()) {
      if (a.includes('+')) continue;
      if (domainCovers(allDomains, a)) continue;
      push(a);
    }
  }
  return out;
}

/** Greedily pack `terms` joined by " OR " into queries no longer than `max`. */
function pack(terms: readonly string[], build: (joined: string) => string, max: number): string[] {
  const queries: string[] = [];
  let current: string[] = [];
  const fits = (list: string[]) => build(list.join(' OR ')).length <= max;
  for (const t of terms) {
    if (current.length === 0) {
      current = [t];
      if (!fits(current)) {
        throw new Error(`maxQueryLength ${max} is too small for a single term: ${t}`);
      }
      continue;
    }
    const next = [...current, t];
    if (fits(next)) {
      current = next;
    } else {
      queries.push(build(current.join(' OR ')));
      current = [t];
      if (!fits(current)) {
        throw new Error(`maxQueryLength ${max} is too small for a single term: ${t}`);
      }
    }
  }
  if (current.length > 0) queries.push(build(current.join(' OR ')));
  return queries;
}

/**
 * Build the Tier 0 fast-path Gmail searches, in the order they should run:
 *
 * 1. known billing senders, `from:( ... )`, split to fit the length cap;
 * 2. ops subject terms;
 * 3. receipt subject terms, one group of queries per language;
 * 4. invoice-looking attachment names.
 *
 * Gmail's `category:purchases` is deliberately not used: on a personal inbox
 * it is mostly shops, shipping, restaurants and brokerages (2026-11-02: 5,763
 * hits, of which a few hundred were software bills already found by the
 * sender queries). Every hit still goes through classifyHeader afterwards.
 *
 * Output is deterministic: the same inputs always produce the same strings in
 * the same order. Every string is at most `maxQueryLength` characters.
 */
export function buildGmailQueries(opts: GmailQueryOptions = {}): string[] {
  const newerThan = opts.newerThan ?? DEFAULT_NEWER_THAN;
  const max = opts.maxQueryLength ?? DEFAULT_MAX_QUERY_LENGTH;
  const excludePromotions = opts.excludePromotions ?? true;
  if (!/^\d+[dmy]$/.test(newerThan)) {
    throw new Error(`newerThan must look like "30d", "6m" or "2y", got "${newerThan}"`);
  }
  if (!Number.isInteger(max) || max < MIN_MAX_QUERY_LENGTH) {
    throw new Error(`maxQueryLength must be an integer of at least ${MIN_MAX_QUERY_LENGTH}`);
  }

  const age = `newer_than:${newerThan}`;
  const notSent = '-in:sent';
  const subjectFilters = [
    notSent,
    '-category:social',
    '-category:forums',
    ...(excludePromotions ? ['-category:promotions'] : []),
  ].join(' ');

  const queries: string[] = [];

  // 1. Known senders. Chatter addresses (PR threads and the like) are excluded.
  const skip = [...new Set(SENDERS.flatMap((s) => s.skipAddresses ?? []))].sort();
  const skipClause = skip.map((a) => `-from:${a}`).join(' ');
  const tail = [age, notSent, skipClause].filter(Boolean).join(' ');
  queries.push(...pack(fromTerms().map(quote), (j) => `from:(${j}) ${tail}`, max));

  // 2. Ops subjects.
  queries.push(
    ...pack(OPS_TERMS.map(quote), (j) => `subject:(${j}) ${age} ${subjectFilters}`, max),
  );

  // 3. Receipt subjects, per language so each query reads as one idea.
  const seen = new Set<string>();
  for (const lang of LANG_ORDER) {
    const terms = RECEIPT_TERMS[lang].filter((t) => !seen.has(t));
    terms.forEach((t) => seen.add(t));
    if (terms.length === 0) continue;
    queries.push(
      ...pack(terms.map(quote), (j) => `subject:(${j}) ${age} ${subjectFilters}`, max),
    );
  }

  // 4. Invoice-looking attachments.
  queries.push(
    ...pack(
      ATTACHMENT_TERMS.map((t) => `filename:${quote(t)}`),
      (j) => `has:attachment (${j}) ${age} ${notSent}`,
      max,
    ),
  );

  return queries;
}
