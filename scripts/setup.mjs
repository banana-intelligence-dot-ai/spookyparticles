#!/usr/bin/env node
/**
 * Spooky Particles local setup. Walks through every account and key once,
 * writing apps/web/.env.local itself so nothing is pasted by hand.
 *
 *   npm run setup            interactive walkthrough (safe to re-run; skips what is set)
 *   npm run setup -- status  show which values are set, never the values
 *   npm run setup -- set KEY read the clipboard into KEY
 *   npm run setup -- keys    only generate the local keys (step 0)
 *   npm run setup -- manifest print the GitHub App manifest we would send
 *
 * How values get in: you copy in the browser, press Return here, the script
 * reads the clipboard (pbpaste), checks the shape, writes the file, and clears
 * the clipboard when the value was a secret. GitHub is created for you through
 * GitHub's app manifest flow, so there is nothing to copy there at all.
 *
 * macOS only (pbpaste, pbcopy, open). No dependencies.
 */
import { createServer } from "node:http";
import { randomBytes, createSign } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = process.env.SP_ENV_FILE || path.join(ROOT, "apps/web/.env.local");
const LOCAL_URL = "http://localhost:3000";
const PROD_URL = "https://spookyparticles.com";
const MANIFEST_PORT = 3456;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

// ---------- env file ----------

function readEnv() {
  if (!existsSync(ENV_PATH)) return { lines: [], values: {} };
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  const values = {};
  for (const line of lines) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) values[m[1]] = m[2];
  }
  return { lines, values };
}

function writeEnv(updates) {
  const { lines } = readEnv();
  const out = [...lines];
  for (const [key, value] of Object.entries(updates)) {
    const idx = out.findIndex((l) => l.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (idx >= 0) out[idx] = line;
    else out.push(line);
  }
  mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  writeFileSync(ENV_PATH, out.filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n") + "\n", { mode: 0o600 });
}

const isSet = (values, key) => Boolean(values[key] && values[key].trim());

// ---------- small helpers ----------

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q) => (await rl.question(q)).trim();

function clipboard() {
  try {
    return execFileSync("pbpaste", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
function clearClipboard() {
  try {
    execFileSync("pbcopy", { input: "" });
  } catch {
    /* ignore */
  }
}
function openUrl(url) {
  try {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* ignore */
  }
  console.log(dim(`  opened ${url}`));
}
const mask = (v) => (v.length <= 10 ? "set" : `${v.slice(0, 6)}… (${v.length} chars)`);

/**
 * Copy-then-Return prompt. Reads the clipboard, validates, writes, clears the
 * clipboard when secret. Returns true when a value was stored.
 */
async function fromClipboard({ key, label, validate, secret = false, transform = (v) => v, optional = false }) {
  for (;;) {
    const answer = await ask(`  Copy the ${bold(label)}, then press Return here${optional ? " (or type skip)" : ""}: `);
    if (optional && answer.toLowerCase() === "skip") return false;
    const raw = transform(clipboard());
    const problem = raw ? validate(raw) : "the clipboard is empty";
    if (problem) {
      console.log(amber(`  That does not look right: ${problem}. Copy it again.`));
      continue;
    }
    writeEnv({ [key]: raw });
    if (secret) clearClipboard();
    console.log(green(`  ${key} stored`) + (secret ? dim(" (clipboard cleared)") : dim(` ${mask(raw)}`)));
    return true;
  }
}

// ---------- steps ----------

async function stepKeys(values) {
  console.log(bold("\n0. Keys"));
  const updates = {};
  if (!isSet(values, "SP_MASTER_KEY")) updates.SP_MASTER_KEY = randomBytes(32).toString("base64");
  if (!isSet(values, "BETTER_AUTH_SECRET")) updates.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
  if (!isSet(values, "BETTER_AUTH_URL")) updates.BETTER_AUTH_URL = LOCAL_URL;
  if (!isSet(values, "POSTHOG_HOST")) updates.POSTHOG_HOST = "https://us.i.posthog.com";
  if (Object.keys(updates).length === 0) {
    console.log(dim("  already set"));
    return;
  }
  writeEnv(updates);
  console.log(green(`  generated ${Object.keys(updates).join(", ")}`));
  console.log(dim("  SP_MASTER_KEY encrypts every stored token. Back it up somewhere safe (1Password) before production."));
}

function buildManifest() {
  return {
    name: "Spooky Particles",
    url: PROD_URL,
    description: "A DevOps harness for vibe coders. Read-only map of your repos and deployments.",
    hook_attributes: { url: `${PROD_URL}/api/webhooks/github`, active: false },
    redirect_url: `http://127.0.0.1:${MANIFEST_PORT}/callback`,
    callback_urls: [`${LOCAL_URL}/api/auth/callback/github`, `${PROD_URL}/api/auth/callback/github`],
    setup_url: `${LOCAL_URL}/api/connect/github/setup`,
    setup_on_update: true,
    public: true,
    request_oauth_on_install: false,
    // Keys are the manifest form's resource names: "emails" is the user "Email addresses" permission
    // (the REST API calls the same permission email_addresses; the form rejects that spelling).
    default_permissions: { metadata: "read", deployments: "read", emails: "read" },
    default_events: [],
  };
}

/** RS256 JWT for the GitHub App itself (iss = app id), valid 9 minutes. */
function appJwt(appId, pem) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(pem).toString("base64url");
  return `${unsigned}.${sig}`;
}

/** Ask GitHub what the new app can actually do, and say plainly if email is missing. */
async function verifyGithubApp(appId, pem, htmlUrl) {
  try {
    const r = await fetch("https://api.github.com/app", {
      headers: { authorization: `Bearer ${appJwt(appId, pem)}`, accept: "application/vnd.github+json", "user-agent": "spooky-particles-setup" },
    });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const app = await r.json();
    const perms = app.permissions ?? {};
    console.log(dim(`  permissions GitHub reports: ${Object.entries(perms).map(([k, v]) => `${k}:${v}`).join(", ") || "none"}`));
    const hasEmail = perms.email_addresses || perms.emails;
    if (!hasEmail) {
      console.log(amber("  Email addresses permission is missing, and sign-in needs it."));
      console.log(`  Fix: open ${htmlUrl}/permissions, under Account permissions set ${bold("Email addresses")} to Read-only, click ${bold("Save changes")}.`);
    }
    if (perms.metadata !== "read" || perms.deployments !== "read") {
      console.log(amber("  Repository permissions should be Metadata: read and Deployments: read. Check the app's Permissions page."));
    }
  } catch (err) {
    console.log(amber(`  Could not verify the app's permissions (${err.message}). Check them at ${htmlUrl}/permissions.`));
  }
}

async function stepGithub(values) {
  console.log(bold("\n1. GitHub App"));
  const needed = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY"];
  if (needed.every((k) => isSet(values, k))) {
    console.log(dim(`  already set (app ${values.GITHUB_APP_SLUG})`));
    return;
  }
  console.log("  GitHub creates the app from a manifest we send, then hands the keys straight back here.");
  const org = await ask("  Owner: press Return for your personal account, or type an organization name: ");
  const target = org ? `https://github.com/organizations/${org}/settings/apps/new` : "https://github.com/settings/apps/new";
  const state = randomBytes(16).toString("hex");
  const manifest = buildManifest();

  const result = await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${MANIFEST_PORT}`);
      if (url.pathname === "/") {
        const json = JSON.stringify(manifest).replace(/</g, "\\u003c");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Spooky Particles setup</title>
<body style="font:16px -apple-system,system-ui;background:#0C0D0F;color:#F2F2EF;padding:48px">
<p>Sending the app manifest to GitHub…</p>
<form id="f" method="post" action="${target}?state=${state}"><input type="hidden" name="manifest" id="m"></form>
<script>document.getElementById("m").value=${JSON.stringify(json)};document.getElementById("f").submit();</script>`);
        return;
      }
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        if (url.searchParams.get("state") !== state || !code) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("State mismatch. Go back to Terminal and run setup again.");
          return;
        }
        try {
          const r = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
            method: "POST",
            headers: { accept: "application/vnd.github+json", "user-agent": "spooky-particles-setup" },
          });
          if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
          const app = await r.json();
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(`<!doctype html><meta charset="utf-8"><title>Done</title>
<body style="font:16px -apple-system,system-ui;background:#0C0D0F;color:#F2F2EF;padding:48px">
<p>GitHub App <b>${app.slug}</b> created and stored. You can close this tab and go back to Terminal.</p>`);
          server.close();
          resolve(app);
        } catch (err) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(`Could not finish: ${err.message}. Go back to Terminal.`);
          server.close();
          reject(err);
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(MANIFEST_PORT, "127.0.0.1", () => {
      console.log("  A GitHub page opens with the app prefilled. Sign in if asked, change nothing, click " + bold("Create GitHub App") + ".");
      console.log(dim("  If GitHub says the name is taken, edit the name on that page before clicking Create."));
      openUrl(`http://127.0.0.1:${MANIFEST_PORT}/`);
    });
    server.on("error", (err) =>
      reject(err.code === "EADDRINUSE" ? new Error(`port ${MANIFEST_PORT} is busy: a previous setup is still open. Press Ctrl+C in that window, then run npm run setup again`) : err),
    );
  });

  writeEnv({
    GITHUB_APP_ID: String(result.id),
    GITHUB_APP_SLUG: result.slug,
    GITHUB_CLIENT_ID: result.client_id,
    GITHUB_CLIENT_SECRET: result.client_secret,
    GITHUB_APP_PRIVATE_KEY: Buffer.from(result.pem, "utf8").toString("base64"),
  });
  console.log(green(`  GitHub App "${result.slug}" created (id ${result.id}); client id, secret and private key stored`));
  await verifyGithubApp(result.id, result.pem, result.html_url);
  console.log(dim(`  App settings: ${result.html_url}. For production, change its Setup URL to ${PROD_URL}/api/connect/github/setup.`));
}

async function stepGoogle(values) {
  console.log(bold("\n2. Google (sign-in and Gmail read-only)"));
  if (isSet(values, "GOOGLE_CLIENT_ID") && isSet(values, "GOOGLE_CLIENT_SECRET")) {
    console.log(dim("  already set"));
    return;
  }
  console.log("  Google has no manifest flow, so this one is clicks. Each page opens for you; do what the line says, then come back.");
  console.log(dim("  Use the Google account that should own the product long term (your Workspace account, not a personal Gmail)."));

  await ask(`  a) Project: click ${bold("Create")} with name spooky-particles, then select it in the top picker. Press Return when done: `);
  openUrl("https://console.cloud.google.com/projectcreate");
  await ask(`  b) Gmail API: click ${bold("Enable")}. Press Return when done: `);
  openUrl("https://console.cloud.google.com/apis/library/gmail.googleapis.com");
  await ask(
    `  c) Consent screen: ${bold("Get Started")}: app name Spooky Particles, your support email, audience ${bold("External")}, your contact email, agree, ${bold("Create")}. Press Return when done: `,
  );
  openUrl("https://console.cloud.google.com/auth/overview");
  await ask(
    `  d) Branding: home page ${PROD_URL}, privacy ${PROD_URL}/privacy, terms ${PROD_URL}/terms, authorized domain spookyparticles.com, no logo. ${bold("Save")}. Press Return when done: `,
  );
  openUrl("https://console.cloud.google.com/auth/branding");
  await ask(
    `  e) Data access: ${bold("Add or remove scopes")}, filter gmail.readonly, tick it, also tick openid, userinfo.email, userinfo.profile. ${bold("Update")}, then ${bold("Save")}. Press Return when done: `,
  );
  openUrl("https://console.cloud.google.com/auth/scopes");
  await ask(
    `  f) Audience: ${bold("Publish app")} and confirm (unverified production, 100 account cap, the warning screen is expected). Add your own Gmail addresses under Test users. Press Return when done: `,
  );
  openUrl("https://console.cloud.google.com/auth/audience");
  console.log(`  g) Client: ${bold("Create client")}, type ${bold("Web application")}, name spooky-particles-web.`);
  console.log(`     Authorized JavaScript origins: ${LOCAL_URL} and ${PROD_URL}`);
  console.log("     Authorized redirect URIs, one per line:");
  for (const u of [
    `${LOCAL_URL}/api/auth/callback/google`,
    `${LOCAL_URL}/api/connect/gmail/callback`,
    `${PROD_URL}/api/auth/callback/google`,
    `${PROD_URL}/api/connect/gmail/callback`,
  ]) {
    console.log(`       ${u}`);
  }
  console.log(`     Click ${bold("Create")}. A box shows the Client ID and Client secret.`);
  openUrl("https://console.cloud.google.com/auth/clients/create");
  await fromClipboard({
    key: "GOOGLE_CLIENT_ID",
    label: "Client ID",
    validate: (v) => (v.endsWith(".apps.googleusercontent.com") ? null : "a Google client id ends with .apps.googleusercontent.com"),
  });
  await fromClipboard({
    key: "GOOGLE_CLIENT_SECRET",
    label: "Client secret",
    secret: true,
    validate: (v) => (v.startsWith("GOCSPX-") ? null : "a Google client secret starts with GOCSPX-"),
  });
}

async function stepNeon(values) {
  console.log(bold("\n3. Neon (Postgres)"));
  if (isSet(values, "DATABASE_URL")) {
    console.log(dim("  already set"));
    return;
  }
  console.log(`  Sign in with GitHub. ${bold("New project")}: name spooky-particles, region US East (Ohio). Then click ${bold("Connect")}, turn on ${bold("Pooled connection")}, and copy the connection string.`);
  openUrl("https://console.neon.tech/app/projects");
  await fromClipboard({
    key: "DATABASE_URL",
    label: "connection string",
    secret: true,
    transform: (v) => {
      const m = /postgres(?:ql)?:\/\/\S+/.exec(v);
      return m ? m[0].replace(/['"]+$/, "") : v;
    },
    validate: (v) => (/^postgres(ql)?:\/\/.+@.+\/.+/.test(v) ? null : "expected something starting with postgresql:// that includes a user, host and database"),
  });
}

async function stepPosthog(values) {
  console.log(bold("\n4. PostHog (analytics, optional today)"));
  if (isSet(values, "NEXT_PUBLIC_POSTHOG_KEY")) {
    console.log(dim("  already set"));
    return;
  }
  console.log(`  Sign up with GitHub, an organization named after your own, project Spooky Particles, ${bold("Product analytics")} only. Then Settings → Project → copy the ${bold("Project API key")} (starts with phc_).`);
  openUrl("https://us.posthog.com/signup");
  await fromClipboard({
    key: "NEXT_PUBLIC_POSTHOG_KEY",
    label: "Project API key",
    optional: true,
    validate: (v) => (v.startsWith("phc_") ? null : "a PostHog project key starts with phc_"),
  });
}

async function stepAnthropic(values) {
  console.log(bold("\n4b. Anthropic API key (reads billing emails into findings)"));
  if (isSet(values, "SP_ANTHROPIC_API_KEY")) {
    console.log(dim("  already set"));
    return;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(dim("  a key is in your shell environment too; one stored here wins over it (a stale shell key breaks reads). Paste a key, or press Return to rely on the shell."));
  } else {
    console.log(`  Console → API keys → ${bold("Create Key")} → name it spooky-particles-dev → copy it (starts with sk-ant-).`);
    openUrl("https://platform.claude.com/settings/keys");
  }
  await fromClipboard({
    key: "SP_ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    secret: true,
    optional: true,
    validate: (v) => (v.startsWith("sk-ant-") ? null : "an Anthropic API key starts with sk-ant-"),
  });
}

async function stepMigrate(values) {
  if (!isSet(values, "DATABASE_URL")) return;
  console.log(bold("\n5. Database tables"));
  const a = await ask("  Create the tables in Neon now? Press Return for yes, or type no: ");
  if (a.toLowerCase() === "no") return;
  const child = spawn("npm", ["run", "db:migrate", "-w", "apps/web"], { cwd: ROOT, stdio: "inherit" });
  await new Promise((resolve) => child.on("close", resolve));
}

const REQUIRED = [
  "SP_MASTER_KEY",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "DATABASE_URL",
];
const OPTIONAL = ["NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_HOST"];

function status() {
  const { values } = readEnv();
  console.log(bold(`\n${path.relative(ROOT, ENV_PATH)}`));
  for (const k of [...REQUIRED, ...OPTIONAL]) {
    const ok = isSet(values, k);
    console.log(`  ${ok ? green("set    ") : OPTIONAL.includes(k) ? dim("empty  ") : amber("missing")} ${k}`);
  }
  const missing = REQUIRED.filter((k) => !isSet(values, k));
  return missing;
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "status") {
    status();
    rl.close();
    return;
  }
  if (cmd === "keys") {
    await stepKeys(readEnv().values);
    status();
    rl.close();
    return;
  }
  if (cmd === "manifest") {
    console.log(JSON.stringify(buildManifest(), null, 2));
    rl.close();
    return;
  }
  if (cmd === "set") {
    if (!arg) throw new Error("usage: npm run setup -- set KEY");
    const secret = /SECRET|KEY|URL|TOKEN/.test(arg) && !arg.startsWith("NEXT_PUBLIC_");
    await fromClipboard({ key: arg, label: `value for ${arg}`, secret, validate: () => null });
    rl.close();
    return;
  }

  console.log(bold("Spooky Particles setup"));
  console.log(dim(`Writes ${path.relative(ROOT, ENV_PATH)}. Re-run any time; set values are skipped. Secrets are never printed.`));

  await stepKeys(readEnv().values);
  await stepGithub(readEnv().values);
  await stepGoogle(readEnv().values);
  await stepNeon(readEnv().values);
  await stepPosthog(readEnv().values);
  await stepAnthropic(readEnv().values);
  await stepMigrate(readEnv().values);

  const missing = status();
  if (missing.length) {
    console.log(amber(`\nStill missing: ${missing.join(", ")}. Run npm run setup again to finish.`));
  } else {
    console.log(green("\nAll set. Start the app:"));
    console.log("  npm run dev\n  then open http://localhost:3000 and continue with GitHub, like any customer.");
  }
  rl.close();
}

main().catch((err) => {
  console.error(amber(`\nSetup stopped: ${err.message}`));
  rl.close();
  process.exit(1);
});
