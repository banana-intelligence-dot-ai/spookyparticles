# apps/web

The Spooky Particles web app and headless API (Next.js App Router, Node runtime, Neon Postgres via Drizzle, Better Auth for sign-in, Vercel Workflow for backfills). Every capability is an `/api/v1` endpoint first; the web pages call the same endpoints and never touch the database.

## Run locally

```bash
npm install                      # from the repo root (npm workspaces)
cp apps/web/.env.example apps/web/.env.local
# fill in .env.local (see the list below)
npm run db:migrate -w apps/web   # applies drizzle/*.sql to DATABASE_URL
npm run dev                      # http://localhost:3000
```

Inspect backfill runs locally with `npx workflow web` from `apps/web`.

## Environment

Every variable has a one-line comment in `.env.example`.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string. Runtime and `db:migrate` only; build and `db:generate` do not need it. |
| `BETTER_AUTH_SECRET` | Signs session cookies. |
| `BETTER_AUTH_URL` | Public base URL; OAuth redirect URIs are built from it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | The GitHub App's own OAuth credentials. Better Auth uses them for "Continue with GitHub". |
| `GITHUB_APP_ID` | The GitHub App's numeric App ID. Issuer of the app JWT. |
| `GITHUB_APP_SLUG` | The app's slug, from `https://github.com/apps/<slug>`. Builds the install link. |
| `GITHUB_APP_PRIVATE_KEY` | Base64 of the `.pem` private key GitHub downloads (`base64 -i key.pem \| tr -d '\n'`). A raw PEM also works. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google web client for sign-in and Gmail connections. |
| `SP_MASTER_KEY` | 32-byte base64 key for AES-256-GCM token encryption. |
| `SP_MASTER_KEY_PREVIOUS` | Retired keys during a rotation, comma-separated. |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog key. Empty means no analytics load or fire. |
| `POSTHOG_HOST` | PostHog host. |

Redirect URIs to register:

- Google: `{BETTER_AUTH_URL}/api/auth/callback/google` (sign-in) and `{BETTER_AUTH_URL}/api/connect/gmail/callback` (Gmail).
- GitHub: see the GitHub App section below.

## GitHub App

One GitHub App does both jobs: sign-in (its OAuth credentials, through Better Auth) and the repo connection (an installation). It reads private repos without any write access, and the user picks the repos on GitHub's own install screen.

Settings at github.com/settings/apps/new (or the org's Developer settings):

| Setting | Value |
|---|---|
| Callback URLs | `{BETTER_AUTH_URL}/api/auth/callback/github`, one per environment (for example `http://localhost:3000/api/auth/callback/github` and `https://spookyparticles.com/api/auth/callback/github`). GitHub Apps accept several. |
| Expire user authorization tokens | On (the default). Better Auth refreshes them. |
| Request user authorization (OAuth) during installation | Off |
| Enable Device Flow | Off |
| Setup URL | `{BETTER_AUTH_URL}/api/connect/github/setup` |
| Redirect on update | On, so changing the repo selection on GitHub resyncs |
| Webhook | Active: off (no webhook for now) |
| Repository permissions | Metadata: Read-only (required by GitHub), Deployments: Read-only. Nothing else. |
| Organization permissions | None |
| Account permissions | Email addresses: Read-only (sign-in reads the primary email when it is private) |
| Where can this app be installed | Any account |

Then copy the App ID and slug, generate a client secret (`GITHUB_CLIENT_SECRET`) and a private key (`GITHUB_APP_PRIVATE_KEY`, base64).

The Setup URL only allows one value per app, so local development needs its own GitHub App whose Setup URL points at localhost.

How it works:

- `GET /api/connect/github/start` (session required) seals a state cookie and sends the user to `https://github.com/apps/{slug}/installations/new?state=...`.
- GitHub returns to `GET /api/connect/github/setup?installation_id&setup_action&state`. The installation id is never trusted on its own. Personal installs link only when the install's account id equals the user's GitHub sign-in id. Organization installs link only right after this user installed them through our link: the state verifies, `setup_action=install`, the user can see the install with their own token, and GitHub created it in the last 15 minutes. Then the connection is saved and the inventory starts.
- Installs made on GitHub directly are adopted on `GET /api/v1/connections` when the user has a GitHub sign-in and no active GitHub connection (personal installs only, idempotent, at most every 30 seconds per server instance).
- Connection row: `external_account_id` is the installation id, `display` the account login, `scopes` the permissions (`deployments:read`, `metadata:read`). No token is stored. Installation tokens are minted on demand (app JWT, then `POST /app/installations/{id}/access_tokens`) and cached in memory until 5 minutes before they expire.
- A 404 or a suspension when minting a token marks the connection `errored` with a short reason.
- Revoke uninstalls the app from that account (`DELETE /app/installations/{id}`).

## API

Auth: the session cookie, or `Authorization: Bearer sp_...` (keys are stored as SHA-256 hashes and scoped `read`, `write`, `approve`). One helper, `requireActor()`, resolves both.

| Method | Path | Scope | What it does |
|---|---|---|---|
| GET | `/api/v1/me` | read | The signed-in user and how the call authenticated. |
| GET | `/api/v1/connections` | read | Connections with their latest sync progress and `statusReason`. Never returns tokens. Also adopts GitHub App installs made on GitHub directly (see GitHub App). |
| POST | `/api/v1/connections/:id/revoke` | write | Revokes at the provider (Google token revoke; GitHub uninstalls the app installation), marks revoked, wipes ciphertext, writes an audit row. |
| POST | `/api/v1/connections/:id/sync` | write | Starts the Gmail backfill or GitHub inventory workflow. 409 if one is running. A GitHub run that paused at the rate limit resumes where it stopped. |
| GET | `/api/v1/inventory` | read | Nodes grouped by kind. Optional `?kind=repo`. |
| GET | `/api/v1/graph` | read | All nodes and edges, with provenance and confidence. |
| GET | `/api/v1/findings` | read | Findings with dollar values and node ids. |
| GET | `/api/v1/findings/summary` | read | Totals only: counts and monthly dollar totals by finding kind. |
| POST | `/api/v1/export` | read | Everything we hold about the caller as JSON. No token ciphertext. |
| POST | `/api/v1/delete` | session | Revokes every connection now and schedules full deletion in 7 days. |
| GET | `/api/v1/api-keys` | read | The caller's API keys (prefix and scopes only). |
| POST | `/api/v1/api-keys` | session | Creates a key; the full key is returned once. |

Connection flows (browser redirects, not API): `GET /api/connect/github/start`, `GET /api/connect/github/setup` (the GitHub App's Setup URL), `GET /api/connect/gmail/start`, `GET /api/connect/gmail/callback`. State (and the PKCE verifier for Gmail) is sealed into an httpOnly cookie bound to the signed-in user. Start routes take `?next=/app` or `?next=/app/connections` for where to land afterwards.

Errors in a 500 keep the JSON code `internal`; the web app shows "Something went wrong on our side. It was logged."

## Checks

```bash
npm test -w apps/web          # vitest: crypto, rate limiter, requireActor, Tier 0 mapping, graph guard, GitHub App JWT and token cache, install policy
npm run build -w apps/web     # production build; needs no env and no database
npm run typecheck -w apps/web
npm run db:generate -w apps/web   # writes SQL to drizzle/; never connects
```

## Layout

- `src/db/schema.ts`: identity, connections, graph, audit log, API keys, backfill tables.
- `src/lib/`: crypto, `requireActor`, providers, connections, rate limiter, Tier 0 adapter, analytics.
- `src/lib/providers/github-app.ts`: app JWT, installation tokens, installation and repo listing. `src/lib/github-connect.ts`: install, setup and adoption. `src/lib/github-installation-policy.ts`: who may link an installation.
- `src/workflows/`: `backfill-gmail.ts`, `github-inventory.ts`, and their steps. The GitHub inventory stops when fewer than 100 requests remain in the hour and stores the last repo id in `sync_runs.cursor`.
- `src/app/app/onboarding.tsx`: the first-run steps on the Map (GitHub, Gmail, provider tokens) until both first syncs finish.
- `drizzle/`: generated migrations plus `0001_audit_log_append_only.sql` (trigger that refuses UPDATE, DELETE and TRUNCATE). `0002_github_app_installations.sql` adds `connections.status_reason` and `sync_runs.cursor`.
- `scripts/mass-revoke.ts`: incident script, `npm run revoke:all -- --confirm`.

## Rules the code enforces

- Tokens are encrypted with AES-256-GCM before they touch the database and are never logged or returned. GitHub installation tokens are never stored at all.
- Env var values never enter the graph; `assertNoSecretValues` rejects attribute keys that could hold them.
- Gmail is read with `gmail.readonly` and `format=metadata` for the first pass. Only candidate messages are then fetched with `format=full`; the body is held in memory for one step and never stored.
- The audit log has one writer (`appendAudit`) and a database trigger against changes.
