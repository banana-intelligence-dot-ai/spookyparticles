import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MAX_QUERY_LENGTH, buildGmailQueries, fromTerms } from '../src/queries.ts';
import { SENDERS } from '../src/senders.ts';

test('default build respects the default cap', () => {
  for (const q of buildGmailQueries()) assert.ok(q.length <= DEFAULT_MAX_QUERY_LENGTH, `${q.length}: ${q.slice(0, 60)}`);
});

test('every query respects a tight custom cap', () => {
  const qs = buildGmailQueries({ maxQueryLength: 300 });
  assert.ok(qs.length > buildGmailQueries().length);
  for (const q of qs) assert.ok(q.length <= 300, `${q.length}: ${q.slice(0, 60)}`);
});

test('deterministic: same input, same output', () => {
  assert.deepEqual(buildGmailQueries(), buildGmailQueries());
  assert.deepEqual(buildGmailQueries({ newerThan: '6m' }), buildGmailQueries({ newerThan: '6m' }));
});

test('starts with the known-sender queries and never uses the purchases category', () => {
  const qs = buildGmailQueries({ newerThan: '90d' });
  assert.ok(qs[0].startsWith('from:('), qs[0]);
  assert.ok(qs[0].includes('newer_than:90d'));
  for (const q of qs) assert.ok(!q.includes('category:purchases'), q);
});

test('default age is two years', () => {
  assert.ok(buildGmailQueries().every((q) => q.includes('newer_than:2y')));
});

test('every sender domain and plain address lands in some from query', () => {
  const joined = buildGmailQueries().filter((q) => q.startsWith('from:(')).join('\n');
  for (const s of SENDERS) {
    for (const d of s.domains) assert.ok(joined.includes(d), `missing domain ${d}`);
  }
  for (const t of fromTerms()) assert.ok(joined.includes(t), `missing ${t}`);
});

test('plus-addressed senders are never emitted', () => {
  for (const t of fromTerms()) assert.ok(!t.includes('+'));
});

test('github PR chatter is excluded from sender queries', () => {
  const fromQs = buildGmailQueries().filter((q) => q.startsWith('from:('));
  assert.ok(fromQs.length >= 1);
  for (const q of fromQs) assert.ok(q.includes('-from:notifications@github.com'));
});

test('subject queries exclude sent mail, social and forums', () => {
  const subj = buildGmailQueries().filter((q) => q.startsWith('subject:('));
  assert.ok(subj.length >= 8);
  for (const q of subj) {
    assert.ok(q.includes('-in:sent') && q.includes('-category:social') && q.includes('-category:forums'));
    assert.ok(q.includes('-category:promotions'));
  }
  const withPromos = buildGmailQueries({ excludePromotions: false }).filter((q) => q.startsWith('subject:('));
  for (const q of withPromos) assert.ok(!q.includes('-category:promotions'));
});

test('localized terms appear in the output', () => {
  const all = buildGmailQueries().join('\n');
  for (const t of ['rechnung', 'facture', 'factura', 'fatura', 'fattura', 'factuur', '領収書']) assert.ok(all.includes(t), t);
});

test('multi-word terms are quoted and parentheses balance', () => {
  for (const q of buildGmailQueries()) {
    assert.equal((q.match(/\(/g) ?? []).length, (q.match(/\)/g) ?? []).length, q);
    assert.equal((q.match(/"/g) ?? []).length % 2, 0, q);
  }
  assert.ok(buildGmailQueries().join('\n').includes('"payment failed"'));
});

test('has an attachment query', () => {
  assert.ok(buildGmailQueries().some((q) => q.startsWith('has:attachment') && q.includes('filename:invoice')));
});

test('bad options throw', () => {
  assert.throws(() => buildGmailQueries({ newerThan: '2 years' }));
  assert.throws(() => buildGmailQueries({ maxQueryLength: 50 }));
});

test('no em dashes in any query', () => {
  for (const q of buildGmailQueries()) assert.ok(!q.includes('\u2014'));
});
