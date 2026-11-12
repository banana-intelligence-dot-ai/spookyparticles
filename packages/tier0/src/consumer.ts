/**
 * Senders that are never the kind of bill this product tracks: shops,
 * shipping, restaurants, banks, brokerages, travel, consumer apps. Their mail
 * fills Gmail's "purchases" category and matches words like "payment" and
 * "order", which is how a personal inbox turned up 8,527 "billing" candidates
 * on 2026-11-02 (Kalshi, USPS, Amazon and Robinhood alone were 4,600).
 *
 * The rule is a skip at Tier 0, before any model sees the message. Subdomains
 * match. A vendor in SENDERS always wins over this list (checked first).
 */
export type ConsumerKind = 'retail' | 'shipping' | 'food' | 'finance' | 'travel' | 'consumer_app' | 'government';

export const CONSUMER_DOMAINS: Record<ConsumerKind, string[]> = {
  retail: [
    'amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.de', 'walmart.com', 'target.com', 'bestbuy.com', 'costco.com',
    'homedepot.com', 'lowes.com', 'etsy.com', 'ebay.com', 'chewy.com', 'wayfair.com', 'ikea.com',
    'nike.com', 'coterie.com', 'hims.com', 'forhims.com', 'ro.co', 'warbyparker.com', 'allbirds.com',
    'zappos.com', 'nordstrom.com', 'macys.com', 'kohls.com', 'cvs.com', 'walgreens.com', 'instacart.com',
  ],
  shipping: ['usps.com', 'informeddelivery.usps.com', 'ups.com', 'fedex.com', 'dhl.com', 'ontrac.com', 'lasership.com', 'getconvey.com', 'narvar.com', 'shipt.com'],
  food: ['doordash.com', 'ubereats.com', 'uber.com', 'grubhub.com', 'seamless.com', 'postmates.com', 'toasttab.com', 'squareup.com', 'square.com', 'clover.com', 'starbucks.com', 'chipotle.com', 'dominos.com', 'opentable.com', 'resy.com'],
  finance: [
    'kalshi.com', 'robinhood.com', 'coinbase.com', 'binance.com', 'kraken.com', 'fidelity.com', 'schwab.com', 'vanguard.com', 'etrade.com',
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'capitalone.com', 'amex.com', 'americanexpress.com', 'discover.com',
    'usbank.com', 'ally.com', 'sofi.com', 'venmo.com', 'cash.app', 'zellepay.com', 'mint.com', 'creditkarma.com', 'experian.com',
    'turbotax.intuit.com', 'irs.gov', 'mercury.com', 'brex.com', 'rampnetwork.com', 'wealthfront.com', 'betterment.com', 'acorns.com', 'public.com', 'webull.com',
  ],
  travel: ['airbnb.com', 'vrbo.com', 'booking.com', 'expedia.com', 'hotels.com', 'kayak.com', 'delta.com', 'united.com', 'aa.com', 'southwest.com', 'jetblue.com', 'alaskaair.com', 'lyft.com', 'marriott.com', 'hilton.com', 'hyatt.com', 'turo.com', 'hertz.com', 'enterprise.com'],
  consumer_app: ['churchcenter.com', 'planningcenteronline.com', 'facebook.com', 'facebookmail.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'nextdoor.com', 'strava.com', 'peloton.com', 'whoop.com', 'ticketmaster.com', 'stubhub.com', 'eventbrite.com', 'ring.com', 'nest.com', 'tesla.com', 'spotify.com', 'netflix.com', 'hulu.com', 'disneyplus.com', 'audible.com', 'kindle.com'],
  government: ['dmv.ca.gov', 'ssa.gov', 'medicare.gov', 'healthcare.gov', 'tolls.com', 'ezpassnj.com', 'thetollroads.com', 'fastrak.org'],
};

const INDEX: { domain: string; kind: ConsumerKind }[] = (Object.keys(CONSUMER_DOMAINS) as ConsumerKind[])
  .flatMap((kind) => CONSUMER_DOMAINS[kind].map((domain) => ({ domain: domain.toLowerCase(), kind })))
  .sort((a, b) => b.domain.length - a.domain.length);

/** The consumer kind for a sending address or bare domain, or undefined. */
export function consumerKind(addressOrDomain: string): ConsumerKind | undefined {
  const lower = addressOrDomain.trim().toLowerCase().replace(/[>.;,]+$/, '');
  const host = lower.includes('@') ? lower.slice(lower.lastIndexOf('@') + 1) : lower;
  for (const { domain, kind } of INDEX) {
    if (host === domain || host.endsWith('.' + domain)) return kind;
  }
  return undefined;
}

/** Subjects that are about a shipment or a shop order, never a software bill. */
export const CONSUMER_SUBJECT_TERMS: string[] = [
  'has shipped',
  'was delivered',
  'out for delivery',
  'is on its way',
  'arriving today',
  'arriving tomorrow',
  'delivery update',
  'track your package',
  'tracking number',
  'your order has',
  'order shipped',
  'order delivered',
  'return received',
  'refund issued',
  'trade confirmation',
  'order filled',
  'position closed',
  'market settled',
  'deposit received',
  'direct deposit',
  'statement is ready',
  'statement is available',
  'your boarding pass',
  'your itinerary',
  'reservation confirmed',
  'table is ready',
];

export const CONSUMER_SUBJECT_RE: RegExp = new RegExp(
  CONSUMER_SUBJECT_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|'),
  'iu',
);

export function hasConsumerSubject(subject: string): boolean {
  return CONSUMER_SUBJECT_RE.test(subject);
}
