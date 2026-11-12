import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SENDERS, isVerified, senderStats } from '../src/senders.ts';

const REQUIRED = [
  'Vercel', 'Netlify', 'Railway', 'Render', 'Fly.io', 'Heroku', 'DigitalOcean', 'AWS',
  'Google Cloud', 'Azure', 'Cloudflare', 'Supabase', 'Neon', 'PlanetScale', 'MongoDB Atlas',
  'Upstash', 'Firebase', 'GitHub', 'GitLab', 'Namecheap', 'GoDaddy', 'Porkbun',
  'Squarespace Domains', 'Cloudflare Registrar', 'Hover', 'Stripe', 'Paddle', 'Lemon Squeezy',
  'Gumroad', 'Apple App Store Connect', 'Apple Developer Program', 'Google Play Console',
  'OpenAI', 'Anthropic', 'Replicate', 'Hugging Face', 'Resend', 'SendGrid', 'Postmark',
  'Twilio', 'Sentry', 'Datadog', 'PostHog', 'Vercel Marketplace', 'Linear', 'Notion', 'Figma',
  'Slack', 'Zapier', 'Make', 'Canva', 'Loom', '1Password', 'Expo', 'Clerk', 'Auth0', 'Algolia',
  'Pinecone', 'Convex', 'Turso', 'Deno Deploy', 'Bun', 'Cursor', 'Replit', 'Lovable', 'Bolt', 'v0',
];

test('table covers every vendor the spec names', () => {
  const have = new Set(SENDERS.map((s) => s.vendor));
  for (const v of REQUIRED) assert.ok(have.has(v), `missing vendor: ${v}`);
});

test('vendor names are unique', () => {
  const names = SENDERS.map((s) => s.vendor);
  assert.equal(new Set(names).size, names.length);
});

test('addresses and domains are lowercase, trimmed, well formed', () => {
  for (const s of SENDERS) {
    for (const a of s.addresses) {
      assert.equal(a, a.toLowerCase().trim(), `${s.vendor}: ${a}`);
      assert.match(a, /^[^\s@+]+@[a-z0-9.-]+\.[a-z]{2,}$/, `${s.vendor}: bad address ${a}`);
    }
    for (const d of s.domains) {
      assert.equal(d, d.toLowerCase().trim(), `${s.vendor}: ${d}`);
      assert.match(d, /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, `${s.vendor}: bad domain ${d}`);
    }
  }
});

test('no address or domain is claimed by two vendors', () => {
  const seen = new Map<string, string>();
  for (const s of SENDERS) {
    for (const key of [...s.addresses, ...s.domains]) {
      const prev = seen.get(key);
      assert.ok(!prev, `${key} is listed under both ${prev} and ${s.vendor}`);
      seen.set(key, s.vendor);
    }
  }
});

test('every verified value is an address or domain of that vendor', () => {
  for (const s of SENDERS) {
    const own = new Set([...s.addresses, ...s.domains]);
    for (const v of s.verified) assert.ok(own.has(v), `${s.vendor}: verified ${v} is not listed`);
  }
});

test('a vendor with verified entries cites at least one source', () => {
  for (const s of SENDERS) {
    if (s.verified.length > 0) assert.ok(s.sources.length > 0, `${s.vendor} has verified entries but no sources`);
  }
});

test('sources are https URLs', () => {
  for (const s of SENDERS) for (const u of s.sources) assert.match(u, /^https:\/\/[^\s]+$/, `${s.vendor}: ${u}`);
});

test('no em dashes in the table', () => {
  assert.ok(!JSON.stringify(SENDERS).includes('\u2014'));
});

test('known verified facts are marked', () => {
  const by = (v: string) => SENDERS.find((s) => s.vendor === v)!;
  assert.ok(isVerified(by('Cloudflare'), 'noreply@notify.cloudflare.com'));
  assert.ok(isVerified(by('Netlify'), 'noreply@netlify.com'));
  assert.ok(isVerified(by('Namecheap'), 'donotreply@name-services.com'));
  assert.ok(!isVerified(by('Vercel'), 'vercel.com'));
});

test('stripe is a processor, not a vendor', () => {
  assert.equal(SENDERS.find((s) => s.vendor === 'Stripe')!.category, 'payments_processor');
});

test('senderStats adds up', () => {
  const st = senderStats();
  assert.equal(st.vendors, SENDERS.length);
  assert.equal(st.entries, st.addresses + st.domains);
  assert.ok(st.verifiedShare >= 0 && st.verifiedShare <= 1);
  assert.equal(st.vendorsWithoutVerified.length + st.vendorsWithVerified, st.vendors);
});
