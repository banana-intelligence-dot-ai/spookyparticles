import type { CheckKey } from "./rules";

const dependabot = ["version: 2", "updates:", "  - package-ecosystem: npm", "    directory: /", "    schedule:", "      interval: weekly", "    open-pull-requests-limit: 5"];

export type CheckSpec = {
  /** Neutral name, shown when a check is unknown or does not apply. */
  name: string;
  /** The finding, shown only when the check is open. */
  title: string;
  /** What a passing check may truthfully say. */
  okTitle: string;
  /** Why it matters, one sentence. */
  why: string;
  /** What we could not see, when a person may know better than we do. */
  limit?: string;
  /** "exposed" is the one red state: something secret is already public. Everything else is a gap to close. */
  severity: "exposed" | "gap";
  fix: { text: string; steps?: string[]; docUrl: string; settingPath?: string };
  agent: { handoff: "pull_request" | "person"; instructions: string; personAfter?: string };
};

/** One source of words for the API, the page and the agent tools. Every sentence here must be true for every project it is shown on. */
export const CHECK_CATALOG: Record<CheckKey, CheckSpec> = {
  previews_open: {
    name: "Preview protection",
    title: "Preview links are open to the world",
    okTitle: "Preview links are protected",
    why: "Anyone who gets a preview link can open work you have not released.",
    severity: "gap",
    fix: { text: "Open Project, Settings, Deployment Protection, then turn on Vercel Authentication with Standard Protection.", docUrl: "https://vercel.com/docs/deployment-protection", settingPath: "deployment-protection" },
    agent: { handoff: "person", instructions: "Give your person the exact setting steps and link in the fix. Ask them to turn on protection, then report told_person." },
  },
  secret_not_sensitive: {
    name: "Secret storage",
    title: "A secret can be read back from your Vercel settings",
    okTitle: "Secrets are marked Sensitive",
    why: "Anyone on the team, or any access token, can read the value. A Sensitive variable can never be read back.",
    limit: "We judge by the variable's name and type. We never read its value.",
    severity: "gap",
    fix: { text: "Open Settings, Environment Variables, edit the variable, then turn on Sensitive. You enter the value again.", docUrl: "https://vercel.com/docs/environment-variables/sensitive-environment-variables", settingPath: "environment-variables" },
    agent: { handoff: "person", instructions: "Give your person the exact setting steps and link in the fix. They enter the value again. Report told_person." },
  },
  secret_in_public_code: {
    name: "Secrets in public code",
    title: "A secret key is visible in your public site",
    okTitle: "No secret keys in the public code we read",
    why: "Anyone who visits the site can copy this key and use it as you.",
    limit: "We read the home page and the scripts it loads, like any visitor. We keep the kind of key and where it was, never the key.",
    severity: "exposed",
    fix: { text: "Replace this key at its provider now, because it is already public. Then keep the new one in a server-only variable, one without a public prefix such as NEXT_PUBLIC_.", docUrl: "https://vercel.com/docs/environment-variables", settingPath: "environment-variables" },
    agent: { handoff: "pull_request", instructions: "Move the key use to the server so it is not in a NEXT_PUBLIC_ variable or shipped script. Open a pull request. Never read or create the key value.", personAfter: "Rotate the key at its provider because the old one is already public." },
  },
  cron_unguarded: {
    name: "Schedule guard",
    title: "Anyone can trigger your scheduled job",
    okTitle: "Schedules have a CRON_SECRET",
    why: "Without a secret, anyone who finds the address can run the job as often as they like.",
    limit: "We cannot see your code. If the route checks something else, dismiss this.",
    severity: "gap",
    fix: { text: "Add a variable named CRON_SECRET in Environment Variables. Vercel then sends it with each run as an Authorization header, and your route compares it.", docUrl: "https://vercel.com/docs/cron-jobs/manage-cron-jobs", settingPath: "environment-variables" },
    agent: { handoff: "pull_request", instructions: "Make each scheduled route answer 401 unless the Authorization header equals the word Bearer, a space, then process.env.CRON_SECRET. Reject every request when CRON_SECRET is not set, so an empty value can never match. Open a pull request. Never create or read the secret value.", personAfter: "Before merging, add CRON_SECRET in Vercel Project, Settings, Environment Variables and mark it Sensitive." },
  },
  deps_not_updated: {
    name: "Dependency updates",
    title: "Nothing keeps your dependencies up to date",
    okTitle: "An update bot is set up",
    why: "Old packages collect known security holes. An update bot opens each fix as a pull request for you.",
    limit: "We looked for a Dependabot or Renovate file in the repo and found none.",
    severity: "gap",
    fix: { text: "Add a file named .github/dependabot.yml with these lines. They are for an npm project; change the ecosystem if yours differs.", steps: dependabot, docUrl: "https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates" },
    agent: { handoff: "pull_request", instructions: "Add .github/dependabot.yml using the lines in the fix. Adjust the package ecosystem and directories to match the repo. Open a pull request." },
  },
};

/** Why a check has no answer, in one plain line. `connect` is true when Connections is where to fix it. */
export const REASON_TEXT: Record<string, { text: string; connect?: boolean }> = {
  check_pending: { text: "Not checked yet." },
  needs_read_token: { text: "Needs a read token for this team.", connect: true },
  needs_github: { text: "Connect GitHub for this repo to check it.", connect: true },
  repo_not_readable: { text: "GitHub did not let us read this repo's file list." },
  private_repo: { text: "We do not read files in private repos, so we cannot check this one." },
  site_protected: { text: "The live site asks for a login, so we did not read it." },
  no_production_site: { text: "We could not reach a live site for this project." },
  scan_limited: { text: "The site was too large to read in full, and we found nothing in the part we read." },
  scan_pending: { text: "The live site has not been read yet." },
  setting_not_recognized: { text: "Vercel returned a setting we do not know yet." },
  no_schedules: { text: "This project has no schedules." },
  no_repo: { text: "This project is not linked to a GitHub repo." },
};

/** Where each kind of key is replaced. Only kinds whose provider is certain are listed. */
const KEY_PROVIDER: Record<string, string> = {
  "Stripe live secret key": "Stripe", "Stripe restricted key": "Stripe", "OpenAI key": "OpenAI", "Anthropic key": "Anthropic",
  "GitHub token": "GitHub", "Slack token": "Slack", "Supabase secret key": "Supabase", "Supabase service role key": "Supabase", "SendGrid key": "SendGrid",
};

/** The open title and fix text, made specific from the evidence where the evidence allows it. */
export function wordsFor(check: CheckKey, evidence: Record<string, unknown>): { title: string; okTitle: string; fixText: string } {
  const spec = CHECK_CATALOG[check];
  const base = { title: spec.title, okTitle: spec.okTitle, fixText: spec.fix.text };
  if (check === "deps_not_updated") {
    // Name the bot we actually found.
    const files = Array.isArray(evidence.files) ? evidence.files.map(String) : [];
    const bot = files.some((f) => f.includes("dependabot")) ? "Dependabot" : files.some((f) => f.includes("renovate")) ? "Renovate" : null;
    if (bot) return { ...base, okTitle: `${bot} is set up` };
  }
  if (check === "secret_not_sensitive") {
    const count = Array.isArray(evidence.names) ? evidence.names.length : 0;
    // A pass with nothing to judge must not claim that secrets are marked Sensitive.
    if (evidence.checked === 0) return { ...base, okTitle: "No secret-looking variables in production or preview" };
    if (count > 1) return { ...base, title: `${count} secrets can be read back from your Vercel settings`, fixText: spec.fix.text.replace("edit the variable", "edit each variable") };
  }
  if (check === "secret_in_public_code") {
    const hits = Array.isArray(evidence.hits) ? evidence.hits : [];
    const providers = new Set(hits.map((h) => (h && typeof h === "object" ? KEY_PROVIDER[String((h as { pattern?: unknown }).pattern)] : undefined)));
    const [only] = providers;
    if (providers.size === 1 && only) return { ...base, fixText: `Replace this key in ${only} now, because it is already public. Then keep the new one in a server-only variable, one without a public prefix such as NEXT_PUBLIC_.` };
  }
  return base;
}
