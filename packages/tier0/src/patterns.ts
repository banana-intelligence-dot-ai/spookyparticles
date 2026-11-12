/**
 * Subject and attachment patterns for Tier 0. Raw term lists first, then the
 * regexes built from them. Both are exported so the Gmail query builder and
 * the classifier share one source of truth.
 *
 * Matching rules for the built regexes:
 * - case-insensitive, Unicode aware;
 * - a term must start at a word boundary (so "prepayment" does not match
 *   "payment"), but may continue ("receipt" matches "receipts");
 * - Japanese terms have no spaces between words, so they match anywhere.
 */

export type Lang = 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'nl' | 'ja';

/** Receipt, invoice, renewal and payment-trouble terms per language. */
export const RECEIPT_TERMS: Record<Lang, string[]> = {
  en: [
    'receipt',
    'invoice',
    'payment',
    'billing',
    'renewal',
    'renews',
    'renewed',
    'subscription',
    'your plan',
    'trial ending',
    'trial ends',
    'trial expires',
    'will expire',
    'payment failed',
    'payment declined',
    'card expiring',
    'card expires',
    'card declined',
    'past due',
    'amount due',
    'order confirmation',
    'you were charged',
  ],
  de: [
    'rechnung',
    'quittung',
    'zahlung',
    'zahlungsbestätigung',
    'beleg',
    'kaufbeleg',
    'abonnement',
    'verlängerung',
    'zahlung fehlgeschlagen',
    'testzeitraum endet',
    'mahnung',
  ],
  fr: [
    'facture',
    'reçu',
    'paiement',
    'confirmation de paiement',
    'renouvellement',
    'abonnement',
    'échec du paiement',
    "fin de l'essai",
  ],
  es: [
    'factura',
    'recibo',
    'pago',
    'comprobante de pago',
    'renovación',
    'suscripción',
    'pago fallido',
    'fin de la prueba',
  ],
  pt: [
    'fatura',
    'recibo',
    'pagamento',
    'comprovante de pagamento',
    'nota fiscal',
    'renovação',
    'assinatura',
    'falha no pagamento',
  ],
  it: [
    'fattura',
    'ricevuta',
    'pagamento',
    'conferma di pagamento',
    'rinnovo',
    'abbonamento',
    'pagamento non riuscito',
  ],
  nl: [
    'factuur',
    'ontvangstbewijs',
    'kwitantie',
    'betaling',
    'betalingsbevestiging',
    'verlenging',
    'abonnement',
    'betaling mislukt',
  ],
  ja: [
    '領収書',
    '請求書',
    'ご請求',
    'お支払い',
    '支払いに失敗',
    '決済',
    '自動更新',
    '更新のお知らせ',
    '定期購入',
    'サブスクリプション',
  ],
};

/** Ops-shaped terms. English only: vendor ops mail is almost always English. */
export const OPS_TERMS: string[] = [
  'deployment failed',
  'deploy failed',
  'failed deployment',
  'build failed',
  'build error',
  'project paused',
  'project has been paused',
  'deprecated',
  'deprecation',
  'end of life',
  'action required',
  'security alert',
  'suspicious sign-in',
  'domain expiring',
  'domain expires',
  'domain expiration',
  'domain is expiring',
  'certificate',
  'ssl expiring',
  'ssl expires',
  'ssl expired',
  'service suspended',
  'account suspended',
  'usage limit',
  'quota exceeded',
  'service disruption',
  'incident',
];

/** Words that make an amount-only subject look like a promotion, not a charge. */
export const PROMO_TERMS: string[] = [
  'sale',
  'off',
  'save',
  'deal',
  'deals',
  'discount',
  'coupon',
  'promo',
  'free shipping',
  'limited time',
  'bonus',
  'win',
  'gift',
];

/** Terms used to recognise invoice-looking attachment names. */
export const ATTACHMENT_TERMS: string[] = [
  'invoice',
  'receipt',
  'rechnung',
  'facture',
  'factura',
  'fatura',
  'fattura',
  'factuur',
  'quittung',
  'ricevuta',
  'recibo',
  '領収書',
  '請求書',
];

/** Every receipt term across languages, de-duplicated, in a stable order. */
export const ALL_RECEIPT_TERMS: string[] = [
  ...new Set((Object.keys(RECEIPT_TERMS) as Lang[]).flatMap((l) => RECEIPT_TERMS[l])),
];

const CJK = /[぀-ヿ㐀-鿿]/u;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build one case-insensitive regex from a list of terms. Spaces inside a term
 * match any run of whitespace; Latin terms need a word start; CJK terms match
 * anywhere.
 */
export function termsToRegex(terms: readonly string[]): RegExp {
  const parts = terms.map((t) => {
    const body = escapeRe(t).replace(/ /g, '\\s+');
    return CJK.test(t) ? body : `(?<![\\p{L}\\p{N}])${body}`;
  });
  return new RegExp(parts.join('|'), 'iu');
}

export const RECEIPT_SUBJECT_RE: RegExp = termsToRegex(ALL_RECEIPT_TERMS);
export const OPS_SUBJECT_RE: RegExp = termsToRegex(OPS_TERMS);
export const PROMO_RE: RegExp = new RegExp(
  PROMO_TERMS.map((t) => `(?<![\\p{L}\\p{N}])${escapeRe(t).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`).join('|') +
    '|\\d+\\s?%',
  'iu',
);

/**
 * A currency symbol or code next to an amount: "$20.00", "€ 9,99", "USD 12",
 * "12.50 EUR", "¥1,200", "1.200,00 €".
 */
export const AMOUNT_RE: RegExp =
  /(?:[$€£¥₹]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?[$€£¥₹])|(?:\b(?:USD|EUR|GBP|CAD|AUD|JPY|CHF|INR|SEK|NOK|DKK|BRL|MXN)\s?\d[\d.,]*)|(?:\d[\d.,]*\s?\b(?:USD|EUR|GBP|CAD|AUD|JPY|CHF|INR|SEK|NOK|DKK|BRL|MXN)\b)|(?:\d[\d.,]*\s?円)/iu;

/**
 * Attachment names that look like an invoice or receipt: a term anywhere in
 * the name, and a PDF extension. "Invoice-2024-001.pdf", "Rechnung_123.pdf",
 * "領収書.pdf". Images and spreadsheets are not matched on purpose: invoices
 * attached as PDF are the overwhelming case.
 */
export const INVOICE_FILENAME_RE: RegExp = new RegExp(
  `(?:${ATTACHMENT_TERMS.map(escapeRe).join('|')}|(?:^|[\\s_.-])inv[-_ ]?\\d)[^/\\\\]*\\.pdf$`,
  'iu',
);

/** Subject prefixes that mark a human reply or forward. */
export const REPLY_PREFIX_RE: RegExp = /^\s*(?:(?:re|fwd?|aw|wg|sv|vs|rv|tr|r)\s*:\s*)+/iu;

/** True when the subject carries a receipt-shaped signal. */
export function hasReceiptSignal(subject: string): boolean {
  if (RECEIPT_SUBJECT_RE.test(subject)) return true;
  // An amount alone counts, unless the subject also reads like a promotion.
  return AMOUNT_RE.test(subject) && !PROMO_RE.test(subject);
}

/** True when the subject carries an ops-shaped signal. */
export function hasOpsSignal(subject: string): boolean {
  return OPS_SUBJECT_RE.test(subject);
}

/** True when any attachment name looks like an invoice. */
export function hasInvoiceAttachment(names: readonly string[] | undefined): boolean {
  return (names ?? []).some((n) => INVOICE_FILENAME_RE.test(n));
}
