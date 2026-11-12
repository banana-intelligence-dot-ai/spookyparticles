/**
 * Who hosts a deployment, read from the GitHub login that created it and from its URL.
 * No imports: the server, the dev preview and the browser share it.
 */

/** Who hosts a deployment, read from the GitHub login that created it (vercel[bot], netlify[bot]) and otherwise from its URL. Null when neither says. */
export function providerOf(url: string | null, creator: string | null): string | null {
  const byCreator = providerFromCreator(creator);
  // Actions runs builds; the deployment URL can still identify the actual production host.
  return byCreator === "GitHub Actions" ? providerFromUrl(url) ?? byCreator : byCreator ?? providerFromUrl(url);
}

const CREATOR_HOSTS: [RegExp, string][] = [
  [/^vercel(\[bot\])?$/, "Vercel"],
  [/^netlify(\[bot\])?$/, "Netlify"],
  [/^render(\[bot\])?$/, "Render"],
  [/^railway(-app)?(\[bot\])?$/, "Railway"],
  [/^cloudflare(-workers-and-pages|-pages)?(\[bot\])?$/, "Cloudflare"],
  [/^heroku(\[bot\])?$/, "Heroku"],
  [/^github-pages(\[bot\])?$/, "GitHub Pages"],
  [/^github-actions(\[bot\])?$/, "GitHub Actions"],
  [/^fly(-apps|io)?(\[bot\])?$/, "Fly.io"],
  [/^aws-amplify.*(\[bot\])?$/, "AWS"],
  [/^aws-(codebuild|elasticbeanstalk|deploy)(\[bot\])?$/, "AWS"],
];

/** The host behind a deployment's creator login, when it is a known host's bot. */
export function providerFromCreator(login: string | null): string | null {
  if (!login) return null;
  const l = login.toLowerCase();
  for (const [re, name] of CREATOR_HOSTS) if (re.test(l)) return name;
  return null;
}

/** Who hosts a deployment, read from its URL. Null when the URL is a custom domain or absent. */
export function providerFromUrl(url: string | null): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "github.com" && /^\/[^/]+\/[^/]+\/actions\//.test(new URL(url).pathname)) return "GitHub Actions";
  const table: [RegExp, string][] = [
    [/\.vercel\.app$/, "Vercel"],
    [/\.netlify\.app$/, "Netlify"],
    [/\.onrender\.com$/, "Render"],
    [/\.fly\.dev$/, "Fly.io"],
    [/\.(up\.)?railway\.app$/, "Railway"],
    [/\.pages\.dev$/, "Cloudflare"],
    [/\.workers\.dev$/, "Cloudflare"],
    [/\.github\.io$/, "GitHub Pages"],
    [/\.herokuapp\.com$/, "Heroku"],
    [/\.supabase\.co$/, "Supabase"],
    [/\.amplifyapp\.com$/, "AWS"],
    [/\.elasticbeanstalk\.com$/, "AWS"],
    [/\.amazonaws\.com$/, "AWS"],
    [/\.azurewebsites\.net$/, "Azure"],
    [/\.run\.app$/, "Google Cloud"],
  ];
  for (const [re, name] of table) if (re.test(host)) return name;
  return null;
}
