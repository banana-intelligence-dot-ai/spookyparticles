---
name: spooky-expiry
description: Make sure nothing in a Vercel project breaks on a date by surprise. Checks domains, certificates, the Node.js version and API key dates, moves an old Node version forward, and records a key's expiry date (name and date only) when the agent helps create it. Use when asked about expiring domains, Node deprecation or key expiry.
---

# Nothing breaks on a date

Covers Standard item 10: nothing breaks on a date by surprise: domains, certificates, the Node version, API keys. See [the Standard, Keep it current](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-current).

## Check

1. If the person uses Spooky, call the MCP tool `list_expirations` (or `GET https://spookyparticles.com/api/v1/expirations` with `Authorization: Bearer $SPOOKY_API_KEY`). It lists Vercel Node.js runtime deprecations and Vercel domain registration expiries, soonest first, and domains whose date is unknown. Domains registered somewhere else show as unknown.
2. **Node version.** Read `engines.node` in `package.json`, and any `.nvmrc` or `.node-version` file. Compare with the Node.js versions Vercel supports: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions. A version with a deprecation date is a date to act on.
3. **Domains.** `vercel domains ls` shows domains bought through Vercel and their expiry. For a domain bought elsewhere, ask the person where it is registered and whether it renews by itself.
4. **Certificates.** Vercel renews certificates by itself for domains that point at Vercel. `vercel certs ls` lists them. A custom certificate the person uploaded does not renew by itself.
5. **API keys.** Look for a "Key dates" table in the repo's README or ops docs. A key with an expiry date and no record is a surprise waiting to happen.

## Fix

- **Old Node version:** on a new branch, set `engines.node` in `package.json` to a supported major version, for example `"22.x"`, and update `.nvmrc` to match. Run the project's install, build and tests on that version. Open a pull request. If the Vercel project setting also pins a version, tell the person: "Open Vercel, this project, Settings, Build and Deployment, Node.js Version, and pick the same version."
- **Domain expiring without auto-renew:** a step for the person: "Turn on auto-renew for <domain> at <registrar>, or renew it before <date>." Never buy or renew anything yourself.
- **Uploaded certificate expiring:** tell the person the date and that Vercel can issue and renew one by itself if the domain points at Vercel.
- **Key with an expiry date and no record:** when the agent helps the person create a key that expires, add or update a "Key dates" table in the repo's README or ops doc in a pull request. Write the key's variable name, the provider, and the expiry date. Never the value.

  | Key | Provider | Expires |
  |---|---|---|
  | `STRIPE_RESTRICTED_KEY` | Stripe | 2027-05-01 |

  Spooky lists the dates Vercel knows today. Typed-in key dates are part of the standard and planned in Spooky.

## Prove it is done

- `list_expirations` shows no Node deprecation for this project, or the pull request moves it forward and the build passes on the new version.
- Every domain is either set to auto-renew or has its renewal date passed to the person.
- Every key that expires has a row with its name and date, and no value.
- Report pull request links and person steps. Never mark anything fixed yourself.

## Rules

- Never print, copy or store a key's value. Names and dates only.
- Never buy, renew, transfer or change a domain or a certificate.
- Pull requests only. Never merge.
- Never delete anything.
