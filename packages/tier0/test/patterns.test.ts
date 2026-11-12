import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AMOUNT_RE, INVOICE_FILENAME_RE, OPS_TERMS, RECEIPT_TERMS, hasInvoiceAttachment, hasOpsSignal,
  hasReceiptSignal, termsToRegex,
} from '../src/patterns.ts';

const RECEIPT_HITS: [string, string][] = [
  ['en', 'Your receipt from Anthropic, PBC #1234-5678'],
  ['en', 'Invoice INV-2026-0042 is available'],
  ['en', 'Your Vercel Pro plan renews on Nov 14'],
  ['en', 'Payment failed for your subscription'],
  ['en', 'Your trial ending soon: pick a plan'],
  ['en', 'Your domain will expire in 30 days'],
  ['en', 'Card expiring: update your payment method'],
  ['de', 'Ihre Rechnung von Hetzner'],
  ['fr', 'Votre facture Scaleway est disponible'],
  ['es', 'Tu factura de Namecheap'],
  ['pt', 'Sua fatura de novembro'],
  ['it', 'La tua fattura è pronta'],
  ['nl', 'Uw factuur van TransIP'],
  ['ja', 'ご利用の領収書をお送りします'],
  ['ja', '【AWS】請求書が発行されました'],
  ['amount', 'Your $20.00 charge from Railway'],
  ['amount', 'Charged 9,99 € for your plan'],
  ['amount', 'USD 49 due today'],
  ['amount', '¥1,200 のご利用'],
];

for (const [lang, subject] of RECEIPT_HITS) {
  test(`receipt signal (${lang}): ${subject}`, () => {
    assert.ok(hasReceiptSignal(subject));
  });
}

const RECEIPT_MISSES = [
  'Lunch tomorrow?',
  'Prepayment terms for the new vendor deal',
  'Weekly product digest: what shipped',
  'Save $20 on your next order, sale ends tonight',
  '50% off all plans this week',
  'Thanks for coming to the meetup',
];

for (const subject of RECEIPT_MISSES) {
  test(`no receipt signal: ${subject}`, () => {
    assert.ok(!hasReceiptSignal(subject));
  });
}

const OPS_HITS = [
  'Deployment failed for spooky-web',
  'Build failed on main',
  'Your project has been paused',
  'Action required: verify your domain',
  'Security alert: new sign-in from Chrome',
  'Your domain is expiring in 7 days',
  'Certificate expiring for api.example.com',
  'Node 18 runtime is deprecated',
];

for (const subject of OPS_HITS) {
  test(`ops signal: ${subject}`, () => {
    assert.ok(hasOpsSignal(subject));
  });
}

test('ops terms do not fire on ordinary mail', () => {
  assert.ok(!hasOpsSignal('Re: lunch on friday'));
});

test('every language has terms and none contain an em dash', () => {
  for (const [lang, terms] of Object.entries(RECEIPT_TERMS)) {
    assert.ok(terms.length >= 6, `${lang} has too few terms`);
    for (const t of terms) assert.ok(!t.includes('\u2014'));
  }
  assert.ok(OPS_TERMS.length >= 15);
  for (const lang of ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'ja']) assert.ok(lang in RECEIPT_TERMS);
});

test('termsToRegex needs a word start for Latin terms but not for Japanese', () => {
  assert.ok(termsToRegex(['payment']).test('Payments received'));
  assert.ok(!termsToRegex(['payment']).test('Prepayment received'));
  assert.ok(termsToRegex(['領収書']).test('お客様の領収書です'));
});

test('amount regex covers symbols and codes', () => {
  for (const s of ['$5', '€ 12,50', '£3.99', '12 USD', 'EUR 40', '1.200 円']) assert.ok(AMOUNT_RE.test(s), s);
  assert.ok(!AMOUNT_RE.test('Room 12 at 5pm'));
});

test('invoice attachment names', () => {
  for (const n of ['Invoice-2026-001.pdf', 'receipt_123.PDF', 'Rechnung_44.pdf', 'facture 9.pdf', '領収書.pdf', 'INV-0042.pdf']) {
    assert.ok(INVOICE_FILENAME_RE.test(n), n);
  }
  for (const n of ['photo.jpg', 'invoice-template.docx', 'notes.pdf', 'resume.pdf']) {
    assert.ok(!INVOICE_FILENAME_RE.test(n), n);
  }
  assert.ok(hasInvoiceAttachment(['a.png', 'Invoice_9.pdf']));
  assert.ok(!hasInvoiceAttachment(undefined));
});
