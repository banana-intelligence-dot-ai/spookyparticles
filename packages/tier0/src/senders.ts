/**
 * Maintained table of known billing and ops senders. This is data, not logic.
 *
 * Honesty rule: an address or domain is listed in `verified` only if it was
 * found in the vendor's own documentation or another reliable source (see
 * `sources`). Everything else is a best guess from observed mail headers or
 * third-party reports and stays unverified until someone checks a real
 * message. The classifier treats both the same; the flag exists so we never
 * overstate how much of this table is confirmed.
 *
 * Matching: an address matches after lowercasing and stripping any `+tag`
 * from the local part. A domain matches itself and every subdomain
 * (`mail.vercel.com` matches `vercel.com`). Broad consumer domains
 * (google.com, amazon.com, microsoft.com, apple.com) are deliberately not
 * listed as domains; those vendors are matched by address only.
 *
 * Last research pass: 2026-11-02.
 */

export type SenderCategory =
  | 'hosting'
  | 'database'
  | 'domains'
  | 'dns_cdn'
  | 'ai'
  | 'payments_processor'
  | 'dev_tools'
  | 'saas';

export type SenderKind = 'billing' | 'ops' | 'both';

export interface KnownSender {
  vendor: string;
  category: SenderCategory;
  /** Exact sending addresses (lowercase, no +tag). */
  addresses: string[];
  /** Sending domains; subdomains match too. */
  domains: string[];
  kinds: SenderKind[];
  /** Subset of `addresses` and `domains` confirmed in vendor docs or a reliable source. */
  verified: string[];
  /** URLs consulted for this vendor. A source does not by itself verify an entry. */
  sources: string[];
  /** Addresses at this vendor that are chatter (PR threads, comments), never candidates. */
  skipAddresses?: string[];
  notes?: string;
}

export const SENDERS: KnownSender[] = [
  // ---------------------------------------------------------------- hosting
  {
    vendor: 'Vercel',
    category: 'hosting',
    addresses: ['notifications@vercel.com', 'ship@vercel.com'],
    domains: ['vercel.com', 'mail.vercel.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://vercel.com/docs/notifications',
      'https://vercel.com/docs/plans/pro/billing',
      'https://vercel.com/kb/guide/where-can-i-get-copies-of-my-vercel-invoices',
    ],
    notes:
      'Vercel docs say deployment failures and alerts are emailed and that invoices and receipts go to the billing contact, but name no sender. Card receipts have been observed arriving through Stripe (invoice+statements@...). The vercel.com domain also sends marketing, which the list-unsubscribe rule filters.',
  },
  {
    vendor: 'Vercel Marketplace',
    category: 'hosting',
    addresses: [],
    domains: [],
    kinds: ['billing'],
    verified: [],
    sources: [
      'https://vercel.com/docs/rest-api/marketplace/submit-invoice',
      'https://vercel.com/docs/rest-api/sdk/marketplace/get-invoice',
    ],
    notes:
      'Marketplace products (databases, auth, AI) are billed on the Vercel invoice, so there is no separate sender. Entry exists for the vendor taxonomy; Tier 1 attributes the line items.',
  },
  {
    vendor: 'Netlify',
    category: 'hosting',
    addresses: ['noreply@netlify.com', 'team@netlify.com'],
    domains: ['netlify.com'],
    kinds: ['both'],
    verified: ['noreply@netlify.com', 'team@netlify.com'],
    sources: [
      'https://answers.netlify.com/t/updates-to-emailed-receipts/85723',
      'https://answers.netlify.com/t/invoice-email-notification/10111',
    ],
    notes:
      'A Netlify staff post says emailed receipts moved from team@netlify.com to noreply@netlify.com. The netlify.com domain entry is an unverified guess.',
  },
  {
    vendor: 'Railway',
    category: 'hosting',
    addresses: ['billing@railway.app', 'billing@railway.com'],
    domains: ['railway.app', 'railway.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://station.railway.com/questions/railway-invoice-email-address-0199159d',
      'https://station.railway.com/questions/payment-issue-1408fc9c',
    ],
    notes:
      'Railway Help Station users report receipts from billing@railway.app and notification mail from notify.railway.app. Railway has since moved to railway.com. Community reports only.',
  },
  {
    vendor: 'Render',
    category: 'hosting',
    addresses: [],
    domains: ['render.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://community.render.com/t/vat-is-missing-in-the-invoice/34893'],
    notes: 'No sender found in docs. Domain-level guess.',
  },
  {
    vendor: 'Fly.io',
    category: 'hosting',
    addresses: ['billing@fly.io'],
    domains: ['fly.io'],
    kinds: ['both'],
    verified: [],
    sources: ['https://fly.io/docs/about/billing/'],
    notes:
      'Fly docs list billing@fly.io as the billing contact, which is where replies go, not proof it is the sender. Past invoices are downloaded through a Stripe portal, so invoice mail may also come from stripe.com.',
  },
  {
    vendor: 'Heroku',
    category: 'hosting',
    addresses: ['noreply@heroku.com', 'invoice@heroku.com'],
    domains: ['heroku.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://help.heroku.com/CGNGRPE8/how-do-i-configure-who-receives-invoice-emails-from-heroku',
    ],
    notes:
      'Heroku help says invoice email goes to the account email, or to team Admins, but names no sender. Addresses are guesses from observed mail.',
  },
  {
    vendor: 'DigitalOcean',
    category: 'hosting',
    addresses: ['billing@digitalocean.com', 'support@digitalocean.com'],
    domains: ['digitalocean.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://docs.digitalocean.com/platform/billing/invoices/'],
    notes:
      'DigitalOcean docs say a PDF invoice is emailed to owner and biller roles, but the indexed text does not show the sender address.',
  },
  {
    vendor: 'AWS',
    category: 'hosting',
    addresses: [
      'no-reply-aws@amazon.com',
      'aws-receivables-support@email.amazon.com',
      'no-reply@sns.amazonaws.com',
    ],
    domains: ['amazonaws.com', 'aws.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://www.repost.aws/articles/ARd7nH12MsQD2mGatim68MyA/changes-to-aws-billing-and-cost-management-email-notifications',
      'https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-pref.html',
    ],
    notes:
      'An AWS re:Post article says billing notifications move to AWS User Notifications from September 2026 with new category-specific senders on an aws.com domain; the page returned 403 to our fetch, so the exact addresses are unconfirmed. no-reply-aws@amazon.com is a user-reported current sender. amazon.com is not listed as a domain because it is the shopping brand.',
  },
  {
    vendor: 'Google Cloud',
    category: 'hosting',
    addresses: ['cloudplatform-noreply@google.com', 'payments-noreply@google.com'],
    domains: [],
    kinds: ['both'],
    verified: [],
    sources: ['https://docs.cloud.google.com/billing/docs/how-to/modify-contacts'],
    notes:
      'Both addresses appear in real Google billing mail per user and press reports. payments-noreply@google.com also carries Google Ads and Workspace billing. Matched by address only.',
  },
  {
    vendor: 'Azure',
    category: 'hosting',
    addresses: ['azure-noreply@microsoft.com'],
    domains: [],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://learn.microsoft.com/en-gb/azure/cost-management-billing/manage/download-azure-invoice-daily-usage-date',
    ],
    notes:
      'Microsoft docs describe emailed invoices but name no sender. Address is from observed mail. microsoft.com is too broad to list as a domain.',
  },
  // ------------------------------------------------------------ dns and cdn
  {
    vendor: 'Cloudflare',
    category: 'dns_cdn',
    addresses: ['noreply@notify.cloudflare.com'],
    domains: ['notify.cloudflare.com', 'cloudflare.com'],
    kinds: ['both'],
    verified: ['noreply@notify.cloudflare.com', 'notify.cloudflare.com'],
    sources: [
      'https://developers.cloudflare.com/fundamentals/account/manage-email-notifications',
      'https://developers.cloudflare.com/billing/manage/invoices/',
      'https://www.cloudflarestatus.com/incidents/72lc3n642lkf',
    ],
    notes:
      'Cloudflare docs: all email notifications are sent from noreply@notify.cloudflare.com. Invoice email is opt-in under Billing. The bare cloudflare.com domain is an unverified guess.',
  },
  {
    vendor: 'Cloudflare Registrar',
    category: 'domains',
    addresses: [],
    domains: [],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://developers.cloudflare.com/registrar/account-options/renew-domains/',
      'https://developers.cloudflare.com/registrar/faq/',
    ],
    notes:
      'Registrar expiry and renewal notices use the same Cloudflare notification sender, so this entry has no sender of its own. Expiry subjects are caught by the ops patterns; Tier 1 labels them as domain_or_dns.',
  },
  // -------------------------------------------------------------- databases
  {
    vendor: 'Supabase',
    category: 'database',
    addresses: [],
    domains: ['supabase.com', 'supabase.io'],
    kinds: ['both'],
    verified: [],
    sources: ['https://supabase.com/docs/guides/platform/billing-on-supabase'],
    notes:
      'No billing sender found in docs. The noreply@mail.app.supabase.io address is the default auth sender for projects and says nothing about billing, so it is not listed.',
  },
  {
    vendor: 'Neon',
    category: 'database',
    addresses: [],
    domains: ['neon.tech', 'neon.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'PlanetScale',
    category: 'database',
    addresses: [],
    domains: ['planetscale.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'MongoDB Atlas',
    category: 'database',
    addresses: [],
    domains: ['mongodb.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Atlas invoices may also arrive from a cloud-specific no-reply address.',
  },
  {
    vendor: 'Upstash',
    category: 'database',
    addresses: [],
    domains: ['upstash.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Firebase',
    category: 'database',
    addresses: ['firebase-noreply@google.com'],
    domains: ['firebase.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes:
      'firebase-noreply@google.com is from observed mail. Firebase billing is Google Cloud billing, so receipts may come from the Google Cloud senders.',
  },
  {
    vendor: 'Turso',
    category: 'database',
    addresses: [],
    domains: ['turso.tech'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Convex',
    category: 'database',
    addresses: [],
    domains: ['convex.dev'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Pinecone',
    category: 'database',
    addresses: [],
    domains: ['pinecone.io'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  // ----------------------------------------------------------------- domains
  {
    vendor: 'Namecheap',
    category: 'domains',
    addresses: ['donotreply@name-services.com', 'noreply@namecheap.com', 'support@namecheap.com'],
    domains: ['namecheap.com', 'name-services.com'],
    kinds: ['both'],
    verified: ['donotreply@name-services.com'],
    sources: [
      'https://www.namecheap.com/support/knowledgebase/article.aspx/984/46/i-received-an-email-from-namecheap-asking-to-verify-contact-data-for-my-domains-what-should-i-do/',
      'https://www.namecheap.com/support/knowledgebase/article.aspx/10610/5/how-to-safelist-namecheap-emails/',
    ],
    notes:
      'Namecheap KB confirms contact-verification notices come from donotreply@name-services.com. Its safelist article names no senders. Press reports say renewal mail may route through SendGrid infrastructure while keeping a Namecheap From address.',
  },
  {
    vendor: 'GoDaddy',
    category: 'domains',
    addresses: [],
    domains: ['godaddy.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://www.godaddy.com/help/allowlisting-email-ips-and-domains-15910'],
    notes:
      'GoDaddy publishes secureserver.net sending hosts, but those are for customers of its email marketing product, not GoDaddy billing mail, so they are not listed.',
  },
  {
    vendor: 'Porkbun',
    category: 'domains',
    addresses: ['messages@porkbun.com', 'support@porkbun.com'],
    domains: ['porkbun.com'],
    kinds: ['both'],
    verified: ['messages@porkbun.com', 'support@porkbun.com', 'porkbun.com'],
    sources: [
      'https://kb.porkbun.com/article/299-is-that-email-really-from-porkbun-how-to-spot-fake-emails',
      'https://kb.porkbun.com/article/312-how-to-see-every-email-porkbun-has-sent-you',
      'https://porkbun.com/security',
    ],
    notes:
      'Porkbun KB: legitimate mail always ends in @porkbun.com, with messages@, support@, abuse@ and verify@ given as examples. Mail about abuse suspensions can come from @reports.cleandns.space.',
  },
  {
    vendor: 'Squarespace Domains',
    category: 'domains',
    addresses: [],
    domains: ['squarespace.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://support.squarespace.com/hc/articles/17131164996365',
      'https://domains.squarespace.com/faq',
    ],
    notes:
      'Successor to Google Domains (acquired 2023-09-07, migration finished 2024-07). Squarespace support says a renewal notice goes out 15 days before renewal. The squarespace.com domain also sends marketing, which the list-unsubscribe rule filters.',
  },
  {
    vendor: 'Hover',
    category: 'domains',
    addresses: [],
    domains: ['hover.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  // ------------------------------------------------------ payment processors
  {
    vendor: 'Stripe',
    category: 'payments_processor',
    addresses: ['receipts@stripe.com', 'invoice@stripe.com'],
    domains: ['stripe.com'],
    kinds: ['billing'],
    verified: [],
    sources: [
      'https://docs.stripe.com/invoicing/send-email',
      'https://docs.stripe.com/receipts',
    ],
    notes:
      'Stripe sends receipts and invoices on behalf of thousands of vendors, so a Stripe hit means "some vendor billed you", not "Stripe billed you". classifyHeader tries Reply-To and the display name to name the real vendor. Stripe docs confirm that with a verified custom email domain, Stripe sends invoice mail from that domain instead (so some vendors never appear as stripe.com). Real mail uses plus-addressing such as invoice+statements+acct_...@stripe.com, which matching normalizes.',
  },
  {
    vendor: 'Paddle',
    category: 'payments_processor',
    addresses: [],
    domains: ['paddle.com', 'paddle.net'],
    kinds: ['billing'],
    verified: [],
    sources: ['https://v2--paddlehq.netlify.app/help/manage/your-customers'],
    notes:
      'Merchant of record: receipts come from Paddle on behalf of the software vendor. A docs mirror confirms receipts are emailed but names no sender.',
  },
  {
    vendor: 'Lemon Squeezy',
    category: 'payments_processor',
    addresses: [],
    domains: ['lemonsqueezy.com'],
    kinds: ['billing'],
    verified: [],
    sources: [
      'https://docs.lemonsqueezy.com/help/checkout/customizing-receipt-emails',
      'https://docs.lemonsqueezy.com/help/orders/resend-receipt',
    ],
    notes: 'Merchant of record. Docs confirm receipt emails exist but name no sender.',
  },
  {
    vendor: 'Gumroad',
    category: 'payments_processor',
    addresses: ['noreply@customers.gumroad.com'],
    domains: ['gumroad.com'],
    kinds: ['billing'],
    verified: [],
    sources: [
      'https://gumroad.com/help/article/78-my-customer-did-not-receive-a-receipt',
      'https://docs.hypermatic.com/faq/receipts',
    ],
    notes: 'Receipt sender is from a third-party doc (hypermatic.com), not Gumroad.',
  },
  // ----------------------------------------------------------- app stores
  {
    vendor: 'Apple App Store Connect',
    category: 'dev_tools',
    addresses: ['no_reply@email.apple.com', 'do_not_reply@email.apple.com'],
    domains: ['email.apple.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://developer.apple.com/forums/thread/705224',
      'https://www.snopes.com/news/2022/07/28/itunes-connect-scam-email/',
      'https://support.apple.com/en-us/102406',
    ],
    notes:
      'Press and forum reports confirm do_not_reply@email.apple.com sent real App Store Connect mail. Apple support lists no sender addresses. apple.com is too broad to list as a domain.',
  },
  {
    vendor: 'Apple Developer Program',
    category: 'dev_tools',
    addresses: ['developer@insideapple.apple.com'],
    domains: ['insideapple.apple.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://support.cablecast.tv/s/articles/apple-developer-programdistribution-certificate-renewal-notice',
    ],
    notes:
      'Membership renewal and certificate expiry notices. Address from observed mail. Charges also appear as receipts from the App Store Connect senders.',
  },
  {
    vendor: 'Google Play Console',
    category: 'dev_tools',
    addresses: [
      'googleplay-developer-support@google.com',
      'noreply-play-developer-console@google.com',
    ],
    domains: [],
    kinds: ['both'],
    verified: [],
    sources: ['https://support.google.com/googleplay/android-developer/answer/15771712'],
    notes:
      'Google says it contacts Play developers only from addresses ending in @google.com, but lists none. Addresses are from observed mail.',
  },
  // ------------------------------------------------------------------- AI
  {
    vendor: 'OpenAI',
    category: 'ai',
    addresses: ['noreply@tm.openai.com', 'no-reply@openai.com', 'billing@openai.com'],
    domains: ['openai.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://community.openai.com/t/email-receipts-to-billing-email-address/731689'],
    notes:
      'No official sender list. A third-party page names no-reply@openai.com and billing@openai.com; tm.openai.com is from observed mail. API invoices may also arrive through Stripe.',
  },
  {
    vendor: 'Anthropic',
    category: 'ai',
    addresses: ['invoice@mail.anthropic.com', 'billing@anthropic.com'],
    domains: ['anthropic.com', 'mail.anthropic.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://support.claude.com/en/articles/10366473-where-can-i-find-full-receipts-and-invoices-for-my-claude-api-and-console-payments',
      'https://support.anthropic.com/en/articles/8325618-where-can-i-find-my-receipt-for-claude-pro',
    ],
    notes:
      'Anthropic help confirms receipts are emailed with the subject "Your receipt from Anthropic" and that billing runs on Stripe, but names no sender. The invoice+statements@mail.anthropic.com style comes from Stripe custom email domains and is from observed mail.',
  },
  {
    vendor: 'Replicate',
    category: 'ai',
    addresses: [],
    domains: ['replicate.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Hugging Face',
    category: 'ai',
    addresses: ['billing@huggingface.co', 'team@huggingface.co'],
    domains: ['huggingface.co'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://huggingface.co/docs/hub/en/billing',
      'https://discuss.huggingface.co/t/how-long-does-it-take-to-receive-a-response-from-billing-support/178462/2',
    ],
    notes:
      'Hub docs list billing@huggingface.co as the billing contact and say invoices are also emailed; that is a contact address, not confirmed as the sender. team@huggingface.co is from an old forum report.',
  },
  // ----------------------------------------------------- email and comms APIs
  {
    vendor: 'Resend',
    category: 'saas',
    addresses: [],
    domains: ['resend.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'SendGrid',
    category: 'saas',
    addresses: [],
    domains: ['sendgrid.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://docs.sendgrid.com/ui/account-and-settings/reading-your-invoice'],
    notes:
      'Part of Twilio. sendgrid.net is infrastructure that carries other companies mail, so it is not listed.',
  },
  {
    vendor: 'Postmark',
    category: 'saas',
    addresses: ['support@postmarkapp.com'],
    domains: ['postmarkapp.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Address from observed mail.',
  },
  {
    vendor: 'Twilio',
    category: 'saas',
    addresses: [],
    domains: ['twilio.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://twilio.com/en-us/changelog/notification-preferences-for-invoices-and-csv-supplement',
    ],
    notes:
      'Twilio lets customers pick emailed monthly invoice PDFs and CSVs under Billing Preferences. No sender named.',
  },
  // ------------------------------------------------------- observability etc
  {
    vendor: 'Sentry',
    category: 'dev_tools',
    addresses: ['noreply@md.sentry.io', 'noreply@sentry.io'],
    domains: ['sentry.io'],
    kinds: ['both'],
    verified: ['noreply@md.sentry.io'],
    sources: [
      'https://blog.sentry.io/important-change-to-our-email-delivery/',
      'https://blog.getsentry.com/important-change-to-our-email-delivery/',
    ],
    notes:
      'Sentry blog (March 2016, marked out of date by Sentry) names noreply@md.sentry.io. A search summary of a 2025 Sentry postmortem says noreply@sentry.io also sends; not read directly.',
  },
  {
    vendor: 'Datadog',
    category: 'dev_tools',
    addresses: ['billing@datadoghq.com'],
    domains: ['datadoghq.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://docs.datadoghq.com/account_management/billing'],
    notes:
      'Datadog docs give billing@datadoghq.com for invoice copies. That is the support contact, not confirmed as the sender.',
  },
  {
    vendor: 'PostHog',
    category: 'dev_tools',
    addresses: [],
    domains: ['posthog.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://posthog.com/docs/billing/common-questions'],
    notes: 'PostHog docs say billing emails go to org owners and admins. No sender named.',
  },
  // -------------------------------------------------------------- git hosts
  {
    vendor: 'GitHub',
    category: 'dev_tools',
    addresses: ['noreply@github.com', 'billing@github.com'],
    domains: ['github.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://docs.github.com/en/billing/how-tos/set-up-payment/manage-payment-info',
      'https://github.blog/news-insights/pdf-receipts',
    ],
    skipAddresses: ['notifications@github.com'],
    notes:
      'GitHub docs say receipts are emailed on every card charge (with a PDF) but name no sender. notifications@github.com carries PR, issue and Actions chatter and is never a candidate.',
  },
  {
    vendor: 'GitLab',
    category: 'dev_tools',
    addresses: [],
    domains: ['gitlab.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    skipAddresses: ['gitlab@mg.gitlab.com'],
    notes:
      'Domain-level guess. gitlab@mg.gitlab.com is the merge request and issue notification sender (observed).',
  },
  // ------------------------------------------------------------------ SaaS
  {
    vendor: 'Linear',
    category: 'saas',
    addresses: [],
    domains: ['linear.app'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes:
      'Domain-level guess. Issue notifications carry list-unsubscribe and are filtered unless the subject has a signal.',
  },
  {
    vendor: 'Notion',
    category: 'saas',
    addresses: ['notify@mail.notion.so'],
    domains: ['notion.so'],
    kinds: ['both'],
    verified: [],
    sources: ['https://www.notion.com/help/customize-notifications-in-notion-mail'],
    notes:
      'Address from observed mail; third-party guides also cite mailer.notion.so and no-reply@notion.so.',
  },
  {
    vendor: 'Figma',
    category: 'saas',
    addresses: ['no-reply@figma.com'],
    domains: ['figma.com'],
    kinds: ['both'],
    verified: [],
    sources: ['https://forum.figma.com/ask-the-community-7/how-do-i-find-my-invoices-34599'],
    notes:
      'Address from observed mail. Figma community threads confirm billing mail exists but name no sender.',
  },
  {
    vendor: 'Slack',
    category: 'saas',
    addresses: ['feedback@slack.com'],
    domains: ['slack.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://slack.com/help/articles/115005855543-Vendor-and-payment-details-for-Slack',
      'https://slack.com/help/articles/49004725000211-Troubleshoot-checkout-and-Billing-page-errors',
    ],
    notes:
      'feedback@slack.com is documented as the support address to write to, not as a billing sender. Slack docs name no billing sender.',
  },
  {
    vendor: 'Zapier',
    category: 'saas',
    addresses: [],
    domains: ['zapier.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Task-limit and failed-Zap alerts count as ops.',
  },
  {
    vendor: 'Make',
    category: 'saas',
    addresses: [],
    domains: ['make.com', 'integromat.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Formerly Integromat.',
  },
  {
    vendor: 'Canva',
    category: 'saas',
    addresses: [],
    domains: ['canva.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Heavy marketing volume; list-unsubscribe filtering matters here.',
  },
  {
    vendor: 'Loom',
    category: 'saas',
    addresses: [],
    domains: ['loom.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Owned by Atlassian; billing may move to Atlassian senders.',
  },
  {
    vendor: '1Password',
    category: 'saas',
    addresses: [],
    domains: ['1password.com'],
    kinds: ['both'],
    verified: [],
    sources: [
      'https://www.1password.community/discussions/lounge/phishing-email-attempt---be-careful-out-there/152985',
    ],
    notes:
      '1Password staff say it keeps a page, "1Password email and marketing domains", listing its sending domains; we could not retrieve it. Verify against that page.',
  },
  {
    vendor: 'Expo',
    category: 'dev_tools',
    addresses: [],
    domains: ['expo.dev'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. EAS build and plan notices.',
  },
  {
    vendor: 'Clerk',
    category: 'saas',
    addresses: [],
    domains: ['clerk.com', 'clerk.dev'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Auth0',
    category: 'saas',
    addresses: [],
    domains: ['auth0.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Owned by Okta; some billing may come from okta.com.',
  },
  {
    vendor: 'Algolia',
    category: 'saas',
    addresses: [],
    domains: ['algolia.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  // -------------------------------------------------- edge runtimes, AI builders
  {
    vendor: 'Deno Deploy',
    category: 'hosting',
    addresses: [],
    domains: ['deno.com', 'deno.dev'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Bun',
    category: 'dev_tools',
    addresses: [],
    domains: ['bun.sh', 'bun.com'],
    kinds: ['ops'],
    verified: [],
    sources: [],
    notes:
      'Domain-level guess. Bun has no billed hosting product that we know of, so only ops mail is expected.',
  },
  {
    vendor: 'Cursor',
    category: 'ai',
    addresses: [],
    domains: ['cursor.com', 'cursor.sh', 'anysphere.co'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Receipts are likely sent through Stripe.',
  },
  {
    vendor: 'Replit',
    category: 'ai',
    addresses: [],
    domains: ['replit.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Lovable',
    category: 'ai',
    addresses: [],
    domains: ['lovable.dev'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess.',
  },
  {
    vendor: 'Bolt',
    category: 'ai',
    addresses: [],
    domains: ['bolt.new', 'stackblitz.com'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes: 'Domain-level guess. Bolt is built by StackBlitz.',
  },
  {
    vendor: 'v0',
    category: 'ai',
    addresses: [],
    domains: ['v0.dev', 'v0.app'],
    kinds: ['both'],
    verified: [],
    sources: [],
    notes:
      'Domain-level guess. v0 credits are billed through the Vercel account, so receipts may come from the Vercel senders.',
  },
];

/** True when `value` (an address or domain of `s`) is in the verified subset. */
export function isVerified(s: KnownSender, value: string): boolean {
  return s.verified.includes(value.toLowerCase());
}

export interface SenderStats {
  vendors: number;
  vendorsWithSender: number;
  addresses: number;
  domains: number;
  entries: number;
  verifiedEntries: number;
  verifiedShare: number;
  vendorsWithVerified: number;
  vendorsWithoutVerified: string[];
  vendorsWithSources: number;
}

/** Counts for the README table. `entries` is addresses plus domains. */
export function senderStats(senders: readonly KnownSender[] = SENDERS): SenderStats {
  const addresses = senders.reduce((n, s) => n + s.addresses.length, 0);
  const domains = senders.reduce((n, s) => n + s.domains.length, 0);
  const verifiedEntries = senders.reduce((n, s) => n + s.verified.length, 0);
  const entries = addresses + domains;
  return {
    vendors: senders.length,
    vendorsWithSender: senders.filter((s) => s.addresses.length + s.domains.length > 0).length,
    addresses,
    domains,
    entries,
    verifiedEntries,
    verifiedShare: entries === 0 ? 0 : verifiedEntries / entries,
    vendorsWithVerified: senders.filter((s) => s.verified.length > 0).length,
    vendorsWithoutVerified: senders.filter((s) => s.verified.length === 0).map((s) => s.vendor),
    vendorsWithSources: senders.filter((s) => s.sources.length > 0).length,
  };
}
