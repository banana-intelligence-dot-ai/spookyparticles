# Spooky Particles Privacy Policy

Last updated: 11 November 2026

## Summary

Spooky Particles (spookyparticles.com) is run by Banana Intelligence LLC. It builds a map of your projects, domains, subscriptions and hosting accounts. It reads Vercel projects, deployments, domains and schedules, and GitHub repositories, deployments and Actions runs. Gmail is optional, by request, for bills and renewals. It reads only what it needs to find bills and project facts. It never changes anything in your accounts in this beta. We do not sell your data, show ads, or train general AI models on it. No person at Banana Intelligence reads your mail unless you ask us to, one message at a time. You can export everything or delete your account whenever you want.

## 1. Who we are

"Spooky Particles", "we" and "us" mean Banana Intelligence LLC. Contact: hello@spookyparticles.com.

This policy covers the Spooky Particles website, app, API and any tool that talks to them (together, the "Service").

## 2. Who can use it

You must be 18 or older. The Service is not directed at children. We do not knowingly collect data from anyone under 18. If you think a child has given us data, write to us and we will delete it.

## 3. What we collect

**Account data.** Your name, email address and profile picture from the sign-in provider, plus basic account settings. New accounts sign in with Vercel, which provides identity, email and profile information. Accounts created before 10 November 2026 may still sign in with GitHub or Google.

**Connection data.** For each connected account: the provider, the account name, the scopes you granted, and the tokens needed to read it. Tokens are encrypted.

**Gmail data (read-only, optional).** Gmail is available by request only, and only accounts added by hand can connect while Google verifies the app. If you connect it, we use the `gmail.readonly` scope. We work in steps:

1. We first read message headers only: sender, subject, date, labels and attachment names.
2. We fetch a message body only when the headers suggest a bill, receipt, renewal or other ops notice.
3. An AI model provided by Anthropic reads that body and pulls out the vendor, amount, plan and renewal dates.
4. We keep those extracted facts. We do not keep the body after extraction (see section 7).

Messages that do not look like billing or ops mail are never fetched beyond their headers.

**GitHub data (read-only).** A GitHub App reads repository metadata, deployments and Actions runs on repositories you pick, including linked deploy URLs and domains. We do not read your source code contents.

**Vercel data (read-only access in our software).** You may install a Vercel integration on projects you pick, with Vercel's read scopes for integration configuration, deployments, projects, team, current user and domains. You may also paste a Vercel access token. Vercel cannot make that token read-only, so our software sends GET requests and one read-only query of request history, with request counts by path and status code per minute, to check whether schedules ran and whether server errors spiked, and to note when a project last had any request. With a pasted token we also read your team's billing charges for the last 30 days and keep a total for each project and each product on that bill, including Vercel's own. From the same charges we note each outside seller's total, such as Neon, and which projects it was billed for. We store project, deployment, domain and schedule records, the time and status code of scheduled runs, and scrubbed lines from failed build logs. Environment variable values that arrive in Vercel responses are discarded in memory and never stored.

**Checks of your live site and settings.** Every few minutes we request each connected project's public address, as any visitor could, and store the status code and the time. For the project check we also read the home page and the scripts it loads, and look for patterns of secret keys. We store the kind of key and the page path where it was found, never the key and never the page. From Vercel we read each project's deployment protection setting, and the name, type and target of its environment variables. We store a variable's name only when a check flags it. We also name the outside services a project appears to use from those names (a name that starts with STRIPE_ names Stripe) and store the service's name, never the variable's value. When your agent records a service you signed up for, we store the service name, the project, an optional monthly cost, whether you or your agent recorded it, and an optional short note. For public GitHub repositories we read the list of file names in the root and `.github` folders, to see whether an update bot is set up.

**Scheduled job check-ins.** For a job you or your agent creates, we store the time and result of each call to its check-in link (ok, start or fail), and any optional short note.

**Alert channels.** We send alerts by email through Resend or to a channel you add: an ntfy topic, a Slack webhook or a Microsoft Teams webhook. We store the channel address you give us.

**Coding agent keys.** You may create API keys with read access, or read and write access, for your own agents. A read-only API and an MCP endpoint serve the same data. When your agent takes a finding from the project check and reports back, we store which key took it, when, the outcome it reported, the pull request link if it gave one, and its short note.

**Public lookups.** For domains we find, we run public DNS, RDAP and TLS lookups. These touch public records, not your accounts.

**Derived data.** The inventory, the map, cost totals and findings (for example, duplicate paid plans or upcoming renewals). Each number links back to the email or API response that produced it.

**Usage data.** First-party, cookieless product events, optional PostHog events, Vercel Web Analytics page views (see section 9), and basic server logs. Our logs are scrubbed of message text.

**Support messages.** What you write to us, and any message you choose to share with us (see section 6).

## 4. How we use it

We use your data to:

- build and show your inventory, map, cost ledger and findings
- watch schedules and check-ins, and send alerts through channels you choose
- serve your data through the API and MCP endpoint to your coding agents
- run the Service, keep it secure, and prevent abuse
- answer your support requests
- measure whether the product works (aggregate analytics)
- meet legal duties

We do not use your data for advertising. We do not build profiles to sell.

## 5. Google user data and Limited Use

Spooky Particles' use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

In plain terms, for data we receive from Google (including Gmail):

- **We use it only to give you the Service.** That means showing you your own inventory and findings.
- **No humans read your mail.** No one at Banana Intelligence reads your Gmail content unless you give per-message consent for support, or it is needed for security, to follow the law, or because the data is aggregated and anonymized for internal operations.
- **No advertising.** We do not use Google data for ads, retargeting or interest-based ads.
- **No sale and no transfer.** We do not sell Google data. We transfer it only to the subprocessors in section 8 that we need to run the Service, and only as far as needed, or where the law requires it.
- **No general model training.** We do not use Google data to develop, improve or train generalized AI or machine-learning models. Models process your data only to produce your results.
- **Read-only.** The Gmail scope we request cannot send, change or delete mail.

You can revoke our access at any time in your Google Account settings (myaccount.google.com/permissions) or inside the Service.

## 6. Who can see your data

**At Banana Intelligence.** Only systems and the small number of staff who run the Service. Staff do not read your mail content. If you want help with a specific message, you can choose to share that one message with us. We read it only for that request and only after you agree.

**Evaluation set (opt-in).** To check that our extraction is accurate, we keep a labeled test set. A message of yours goes into it only if you opt that message in. You can ask us to remove it at any time. Messages from Banana Intelligence's own accounts are also used.

**Share cards.** The result card is private by default and shows totals only. Rows are hidden unless you opt each one in after a preview. If a public share page is offered later, it will use unguessable, revocable links that are hidden from search engines. You decide what is on it.

**Subprocessors.** Section 8.

**Legal.** We may disclose data if the law requires it. We will push back on requests that are too broad and tell you about them where we are allowed to.

**Business transfer.** If Banana Intelligence is sold or merged, your data may move with the Service. The promises in this policy, including Limited Use, would continue to apply. We would tell you first.

We do not sell personal data and do not "share" it for cross-context advertising.

## 7. How long we keep data

| Data | How long |
|---|---|
| Extracted records (vendor, amount, plan, dates), inventory, findings | While your account exists |
| Raw message bodies | Held encrypted only for the short extraction window, then dropped. Not kept after extraction, except a message you opt into the evaluation set |
| Connection tokens | Until you revoke the connection or delete your account |
| Audit log | While your account exists. On deletion, the rows are stripped of anything that identifies you or your accounts and only the action type and timestamp are kept, so we can still investigate a security incident |
| Analytics events | Per our analytics provider's settings; deleted with your account |

**When you revoke a connection:** its tokens are deleted immediately. Data derived from that connection is deleted within 30 days.

**When you delete your account:** use the delete function in the product (it calls our delete API endpoint). We delete your data within 30 days. Backups roll off within 30 days after that.

We may keep limited records we must keep by law, such as proof of a deletion request.

## 8. Subprocessors

These companies process data for us.

| Name | Purpose | Region |
|---|---|---|
| Vercel Inc. | Hosting, scheduled tasks, web analytics and connected Vercel data | United States (confirm exact regions before publishing) |
| Neon (Databricks) | Postgres database for your records | To be confirmed |
| Anthropic | Classifying and extracting facts from candidate emails when you connect Gmail. Not used to train its models on our API data | United States (to be confirmed) |
| PostHog | Product analytics | To be confirmed (US or EU cloud) |
| Resend | Alert email delivery | To be confirmed |
| GitHub (Microsoft) | Sign-in for eligible existing accounts and read-only repository data you connect | United States |
| Google | Sign-in for eligible existing accounts and optional read-only Gmail data you connect | United States |

GitHub, Google and Vercel are also services you choose to connect. They act on your instructions and have their own privacy policies. Alerts you direct to ntfy, Slack or Microsoft Teams go to the channel you choose.

**Notice of changes.** We announce any new subprocessor in advance, in the product or by email, so you can object or delete your account first.

## 9. Analytics

We count first-party product events without cookies. Vercel Web Analytics counts page views, visitors, referrers and campaign tags. When configured, PostHog receives product events. We record events such as: arrival and referral tags, sign-in, consent screen shown, consent granted or abandoned, first result shown and how long it took, backfill complete, audit completed, result card viewed or shared, an outbound link clicked, a finding marked "wrong?", an agent key created, an alert sent, and an action requested.

We do **not** use third-party advertising trackers. We do **not** record sessions or screens that show mail content. Events carry identifiers and counts, not the text of your messages.

## 10. Security

- Encryption in transit and at rest.
- Connection tokens are encrypted. The Vercel integration uses Vercel's read scopes; for pasted Vercel tokens, our software enforces read-only access.
- Read-only by default. In this release there are no write actions in connected accounts.
- In later releases that can change things in your accounts, each action needs your approval, and we follow a "never delete" rule: the product does not delete resources in your accounts.
- Environment variable values are never stored.
- An append-only audit log records every token read and, later, every write.
- Pipeline steps pass encrypted references, not message bodies, and logs are scrubbed.

**Breach notice.** If a breach affects your data, we will tell affected users within 72 hours after we confirm it. The notice will say what happened, what data was involved, and what to do.

No system is perfectly secure. If you find a problem, write to hello@spookyparticles.com.

## 11. Your choices and rights

- **Export.** Download everything we hold about you as JSON, any time, from the product.
- **Delete.** Delete a connection or your whole account (section 7).
- **Revoke.** Remove access from the provider's own settings at any time.
- **Access, correct, object, restrict.** Write to us. Depending on where you live (for example the EU, the UK or California), you may have legal rights over your data. We honor them for all users where we reasonably can. We will answer within 30 days.
- **Complaints.** You may complain to your local data protection authority.

## 12. Employer and work inboxes

If you connect a work inbox, your employer may own that data. We detect company domains when you connect, warn you, and limit reading to known billing senders. Connect work accounts only if you are allowed to. See our Terms.

## 13. Where data is processed

Our subprocessors may process data in the United States and other countries. Where required, we rely on standard contractual clauses or similar safeguards for transfers.

## 14. Changes

If we make a material change, we will tell you in the product or by email before it takes effect. The date at the top shows the latest version.

## 15. Contact

Banana Intelligence LLC
Email: hello@spookyparticles.com
Mailing address: [address to be added]
