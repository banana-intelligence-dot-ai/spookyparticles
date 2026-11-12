# @spooky/tier0

Tier 0 of the email pipeline. It decides, from headers alone, which messages are worth fetching a body for. No model calls, no bodies, no runtime dependencies.

Four parts:

| File | What it is |
|---|---|
| `src/senders.ts` | Maintained table of known billing and ops senders, as data. |
| `src/patterns.ts` | Receipt-shaped and ops-shaped subject terms in eight languages, plus the regexes built from them. |
| `src/queries.ts` | `buildGmailQueries()`: the fast-path Gmail searches, split to fit a length cap. |
| `src/classify.ts` | `classifyHeader()`: the per-message decision, with skip rules. |

## Use

```ts
import { buildGmailQueries, classifyHeader } from '@spooky/tier0';

// Fast path: run these server-side with users.messages.list (q = each string).
const queries = buildGmailQueries({ newerThan: '2y' });

// Exhaustive pass: classify each message's headers.
const r = classifyHeader({
  from: 'Netlify <noreply@netlify.com>',
  subject: 'Your Netlify receipt',
  listUnsubscribe: false,
  labels: ['INBOX', 'CATEGORY_UPDATES'],
});
// { candidate: true, reason: 'known_sender', vendor: 'Netlify', category: 'hosting' }
```

`classifyHeader` returns `{ candidate, reason, vendor?, category?, skipReason? }`:

- `reason`: `known_sender`, `receipt_subject`, `ops_subject`, `attachment`, or `none`. When several apply the order is the order listed.
- `skipReason` (only on non-candidates that were deliberately skipped): `sent`, `social`, `forum`, `newsletter`.

### The rules, in order

1. Threads the person sent (`isSent` or the `SENT` label): skip.
2. `CATEGORY_SOCIAL`, `CATEGORY_FORUMS`, or a chatter address such as `notifications@github.com`: skip.
3. Newsletters: a `List-Unsubscribe` header or `CATEGORY_PROMOTIONS` with no receipt subject, ops subject or invoice attachment: skip, even from a known sender. Vendors send marketing from the same domains as billing mail; a receipt or alert has a signal in the subject, marketing does not.
4. Known sender (address, or domain including subdomains): candidate. For payment processors such as Stripe, Reply-To and then the display name are used to name the real vendor.
5. Receipt subject, then ops subject, then invoice-looking PDF name: candidate.

Subject signals are ignored for `Re:` and `Fwd:` threads and for mail from consumer mailbox providers (gmail.com, outlook.com, and so on). A person writing "invoice" is not a billing system.

Gmail's own `category:purchases` is used as a search, not as a classifier input, so a purchases-category message from an unknown sender with an unremarkable subject is found by the fast-path search and judged again at Tier 1.

### Gmail query length

`buildGmailQueries` caps every string at 1,400 characters by default (`maxQueryLength` overrides). Google documents no limit. The only measurement is an April 2024 test that found Gmail filter criteria under 1,469 characters save and over 1,488 are rejected ([source](https://www.spudart.org/blog/character-limit-for-gmail-filter/)); we assume search shares that parser and keep a margin below it.

## Adding a vendor

Add one object to `SENDERS` in `src/senders.ts`:

```ts
{
  vendor: 'Example Cloud',
  category: 'hosting',            // hosting | database | domains | dns_cdn | ai | payments_processor | dev_tools | saas
  addresses: ['billing@example.cloud'],
  domains: ['example.cloud'],     // subdomains match automatically
  kinds: ['both'],                // billing | ops | both
  verified: [],                   // see the honesty rule
  sources: ['https://example.cloud/docs/billing-emails'],
  notes: 'Anything the next person should know.',
}
```

Rules the tests enforce: unique vendor names, lowercase well-formed values, no address or domain claimed by two vendors, `verified` is a subset of `addresses` plus `domains`, and a vendor with verified entries must have a source.

Do not list broad consumer domains (google.com, amazon.com, microsoft.com, apple.com) as domains. Match those vendors by exact address. If a vendor sends chatter from the same domain (PR comments, issue threads), put that address in `skipAddresses`.

Then add a test case to `test/classify.test.ts` if the vendor needs a special rule.

## The honesty rule

An address or domain goes into `verified` only if it was found in the vendor's own documentation or another reliable source, and that source goes into `sources`. Everything else is a guess from observed mail or third-party reports and stays out of `verified`, with a note saying where the guess came from. The classifier treats verified and unverified entries the same; the flag exists so this table never claims more than it knows.

A source being listed does not mean the entry is verified. Many `sources` are billing docs that confirm mail exists but name no sender. "Domain-level guess" in `notes` means the vendor's primary domain was listed with no address found.

Upgrade an entry by checking the headers of a real message (From, Return-Path, DKIM `d=`), then moving the value into `verified` and adding the source or a note saying it came from a real header.

## Counts

Run `npm run stats` to regenerate. Last run 2026-11-02.

| Measure | Count |
|---|---|
| Vendors in the table | 67 |
| Vendors with at least one address or domain | 65 |
| Addresses | 48 |
| Domains | 79 |
| Entries (addresses plus domains) | 127 |
| Verified entries | 9 |
| Verified share of entries | 7.1% |
| Vendors with at least one verified entry | 5 (Netlify, Cloudflare, Namecheap, Porkbun, Sentry) |
| Vendors citing at least one source | 38 |

Two vendors have no sender of their own by design: Vercel Marketplace (billed on the Vercel invoice) and Cloudflare Registrar (uses the Cloudflare notification sender).

## Development

```sh
npm test        # node --experimental-strip-types --test "test/*.test.ts", Node 24, no dev dependency
npm run build   # tsc to dist/ with .d.ts
npm run stats   # print the counts above
```

Source is erasable TypeScript only (no enums, no parameter properties) so Node can run it directly. Imports use `.ts` extensions; `tsc` rewrites them to `.js` in `dist/`.
