import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHeader, findSender, normalizeAddress, parseAddress, type Header } from '../src/classify.ts';

function check(name: string, h: Header, want: Record<string, unknown>) {
  test(name, () => {
    const got = classifyHeader(h);
    for (const [k, v] of Object.entries(want)) {
      assert.equal((got as unknown as Record<string, unknown>)[k], v, `${k}: ${JSON.stringify(got)}`);
    }
  });
}

// --- known senders ----------------------------------------------------------
check('Netlify receipt from the verified address', {
  from: 'Netlify <noreply@netlify.com>', subject: 'Your Netlify receipt',
}, { candidate: true, reason: 'known_sender', vendor: 'Netlify', category: 'hosting' });

check('Cloudflare notification from the verified sender', {
  from: 'Cloudflare <noreply@notify.cloudflare.com>', subject: 'Your domain is expiring',
}, { candidate: true, reason: 'known_sender', vendor: 'Cloudflare', category: 'dns_cdn' });

check('known sender on a subdomain matches the parent domain', {
  from: 'Vercel <billing@mail.vercel.com>', subject: 'Your Vercel invoice',
}, { candidate: true, reason: 'known_sender', vendor: 'Vercel' });

check('known sender with no subject signal and no unsubscribe is still a candidate', {
  from: 'Railway <billing@railway.app>', subject: 'Thanks for upgrading',
}, { candidate: true, reason: 'known_sender', vendor: 'Railway' });

check('Google Cloud matches by address only', {
  from: 'Google Cloud <CloudPlatform-noreply@google.com>', subject: 'Your billing account',
}, { candidate: true, reason: 'known_sender', vendor: 'Google Cloud' });

check('other google.com mail is not a known sender', {
  from: 'Google <no-reply@accounts.google.com>', subject: 'Welcome',
}, { candidate: false, reason: 'none' });

check('Apple App Store Connect by address', {
  from: 'App Store Connect <no_reply@email.apple.com>', subject: 'Your app status',
}, { candidate: true, vendor: 'Apple App Store Connect' });

check('address match ignores case and plus tags', {
  from: 'GitHub <NoReply+abc@GitHub.com>', subject: 'Your GitHub receipt',
}, { candidate: true, reason: 'known_sender', vendor: 'GitHub' });

// --- processors -------------------------------------------------------------
check('Stripe receipt with a vendor Reply-To is attributed to the vendor', {
  from: '"Anthropic, PBC" <invoice+statements+acct_1ABC@stripe.com>',
  replyTo: 'support@anthropic.com', subject: 'Your receipt from Anthropic, PBC #1',
}, { candidate: true, reason: 'known_sender', vendor: 'Anthropic', category: 'ai' });

check('Stripe receipt with the vendor only in the display name', {
  from: '"Railway Corp" <receipts+acct_9@stripe.com>', subject: 'Receipt #55',
}, { candidate: true, vendor: 'Railway' });

check('Stripe receipt for an unknown vendor stays attributed to Stripe', {
  from: '"Some Tiny SaaS" <receipts+acct_2@stripe.com>', subject: 'Your receipt from Some Tiny SaaS',
}, { candidate: true, reason: 'known_sender', vendor: 'Stripe', category: 'payments_processor' });

// --- subject signals from unknown senders -----------------------------------
check('receipt subject from an unknown business domain', {
  from: 'Billing <billing@acme-hosting.example>', subject: 'Receipt for your payment',
}, { candidate: true, reason: 'receipt_subject' });

check('ops subject from an unknown business domain', {
  from: 'Ops <alerts@tinycloud.example>', subject: 'Deployment failed for prod-api',
}, { candidate: true, reason: 'ops_subject' });

check('German invoice from an unknown sender', {
  from: 'Hetzner <no-reply@hetzner-ish.example>', subject: 'Ihre Rechnung R0012345',
}, { candidate: true, reason: 'receipt_subject' });

check('Japanese receipt from an unknown sender', {
  from: 'ストア <info@store.example>', subject: '領収書を発行しました',
}, { candidate: true, reason: 'receipt_subject' });

check('amount-only subject is a receipt signal', {
  from: 'shop@store.example', subject: 'You paid $12.00 to Example Co',
}, { candidate: true, reason: 'receipt_subject' });

check('receipt subject beats ops subject when both are present', {
  from: 'x@unknown.example', subject: 'Action required: payment failed',
}, { candidate: true, reason: 'receipt_subject' });

// --- attachments ------------------------------------------------------------
check('invoice-looking PDF from an unknown sender is a candidate', {
  from: 'accounts@supplier.example', subject: 'March',
  attachmentNames: ['Invoice-2026-03.pdf'],
}, { candidate: true, reason: 'attachment' });

check('a non-invoice PDF is not', {
  from: 'accounts@supplier.example', subject: 'March', attachmentNames: ['notes.pdf'],
}, { candidate: false, reason: 'none' });

check('attachment rescues a bulk-looking message', {
  from: 'accounts@supplier.example', subject: 'Your monthly document', listUnsubscribe: true,
  attachmentNames: ['Rechnung_44.pdf'],
}, { candidate: true, reason: 'attachment' });

// --- skip rules -------------------------------------------------------------
check('threads the person sent are skipped (isSent)', {
  from: 'me@example.com', subject: 'Invoice for March', isSent: true,
}, { candidate: false, skipReason: 'sent' });

check('threads the person sent are skipped (SENT label)', {
  from: 'me@example.com', subject: 'Invoice for March', labels: ['SENT'],
}, { candidate: false, skipReason: 'sent' });

check('social category is skipped', {
  from: 'LinkedIn <invitations@linkedin.com>', subject: 'You have a new payment request', labels: ['CATEGORY_SOCIAL'],
}, { candidate: false, skipReason: 'social' });

check('forums category is skipped', {
  from: 'list@groups.example', subject: 'Re: invoice template', labels: ['CATEGORY_FORUMS'],
}, { candidate: false, skipReason: 'forum' });

check('TRAP: Vercel marketing newsletter with list-unsubscribe and no receipt words', {
  from: 'Vercel <hello@vercel.com>', subject: 'Ship faster: what is new in Next.js 17', listUnsubscribe: true,
}, { candidate: false, reason: 'none', skipReason: 'newsletter' });

check('TRAP: promotions-category marketing from a known sender', {
  from: 'Canva <no-reply@canva.com>', subject: 'Design your holiday cards', labels: ['CATEGORY_PROMOTIONS'],
}, { candidate: false, skipReason: 'newsletter' });

check('TRAP: GitHub pull request notification', {
  from: 'octocat <notifications@github.com>', subject: '[acme/web] Fix invoice rounding (PR #42)',
  listUnsubscribe: true,
}, { candidate: false, skipReason: 'forum' });

check('TRAP: GitHub notification with an ops word in the title is still chatter', {
  from: 'GitHub <notifications@github.com>', subject: '[acme/web] Deployment failed (PR #43)',
}, { candidate: false, skipReason: 'forum' });

check('TRAP: personal email from Gmail mentioning invoice', {
  from: 'Sam Lee <sam.lee@gmail.com>', subject: 'invoice for the dog walking',
}, { candidate: false, reason: 'none' });

check('TRAP: reply thread mentioning invoice from a company domain', {
  from: 'Dana <dana@clientco.example>', subject: 'Re: Invoice for the March sprint',
}, { candidate: false, reason: 'none' });

check('TRAP: forwarded receipt text is not trusted as a billing system', {
  from: 'Pat <pat@clientco.example>', subject: 'Fwd: Your receipt from Anthropic',
}, { candidate: false, reason: 'none' });

check('TRAP: promo with a dollar amount', {
  from: 'deals@store.example', subject: 'Save $20 on your next order',
}, { candidate: false, reason: 'none' });

check('TRAP: unknown newsletter with a receipt word and list-unsubscribe still counts as a signal', {
  from: 'news@blog.example', subject: 'How to read a receipt like a pro', listUnsubscribe: true,
}, { candidate: true, reason: 'receipt_subject' });

check('unknown sender, ordinary subject', {
  from: 'friend@workplace.example', subject: 'Lunch on Friday?',
}, { candidate: false, reason: 'none' });

check('known sender with receipt subject and unsubscribe header is kept', {
  from: 'Squarespace <no-reply@squarespace.com>', subject: 'Your domain renewal receipt', listUnsubscribe: true,
}, { candidate: true, reason: 'known_sender', vendor: 'Squarespace Domains' });

// --- helpers ----------------------------------------------------------------
test('parseAddress handles quoted names, angle brackets and bare addresses', () => {
  assert.equal(parseAddress('"Doe, Jane" <Jane@Example.com>')?.address, 'jane@example.com');
  assert.equal(parseAddress('bare@example.com')?.address, 'bare@example.com');
  assert.equal(parseAddress('Name <a+b@x.io>')?.address, 'a@x.io');
  assert.equal(parseAddress('no address here'), undefined);
  assert.equal(parseAddress(undefined), undefined);
});

test('normalizeAddress lowercases and strips +tags', () => {
  assert.equal(normalizeAddress('Invoice+Statements+acct_1@Stripe.com'), 'invoice@stripe.com');
});

test('findSender prefers an exact address over a domain match', () => {
  assert.equal(findSender('noreply@notify.cloudflare.com')?.vendor, 'Cloudflare');
  assert.equal(findSender('nobody@unknown.example'), undefined);
});

test('a malformed From header does not throw', () => {
  const r = classifyHeader({ from: '', subject: 'Invoice' });
  assert.equal(typeof r.candidate, 'boolean');
});

// --- consumer commerce and finance (never a bill this product tracks) ---------
check('a brokerage trade confirmation is skipped as consumer', {
  from: 'Kalshi <no-reply@kalshi.com>', subject: 'Your order was filled', labels: ['CATEGORY_UPDATES'],
}, { candidate: false, skipReason: 'consumer' });

check('a shipping notice is skipped even with a payment word in it', {
  from: 'USPS Informed Delivery <USPSInformeddelivery@email.informeddelivery.usps.com>', subject: 'Your daily digest: package payment confirmed',
}, { candidate: false, skipReason: 'consumer' });

check('an Amazon order is skipped as consumer', {
  from: 'Amazon.com <auto-confirm@amazon.com>', subject: 'Your Amazon.com order #112-3 has shipped',
}, { candidate: false, skipReason: 'consumer' });

check('a shipment subject from an unknown shop is skipped', {
  from: 'Some Shop <orders@someshop.example>', subject: 'Your order is on its way',
}, { candidate: false, skipReason: 'consumer' });

check('a known vendor wins over a consumer-looking subject', {
  from: 'Vercel <invoice+statements@vercel.com>', subject: 'Your receipt from Vercel',
}, { candidate: true, reason: 'known_sender', vendor: 'Vercel' });

check('an unknown SaaS invoice is still a candidate', {
  from: 'Fathom <billing@usefathom.com>', subject: 'Your Fathom Analytics invoice',
}, { candidate: true, reason: 'receipt_subject' });

test('consumerKind matches subdomains and bare domains', async () => {
  const { consumerKind } = await import('../src/consumer.ts');
  assert.equal(consumerKind('x@email.informeddelivery.usps.com'), 'shipping');
  assert.equal(consumerKind('robinhood.com'), 'finance');
  assert.equal(consumerKind('billing@vercel.com'), undefined);
});

test('skips Spooky Particles own alerts, which would count each failure twice', () => {
  const own = classifyHeader({ from: 'Spooky Particles <alerts@mail.spookyparticles.com>', subject: 'supportgrid: preview deploy failed on GitHub Actions (CI)' });
  assert.equal(own.candidate, false);
  assert.equal(own.skipReason, 'own');
  assert.equal(classifyHeader({ from: 'hello@spookyparticles.ai', subject: 'Your invoice' }).skipReason, 'own');
  assert.notEqual(classifyHeader({ from: 'notifications@vercel.com', subject: 'Production deployment failed for site' }).skipReason, 'own');
});
