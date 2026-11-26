/**
 * Reference pages (for example the Vercel errors pages): one Markdown file each in
 * content/reference/<slug>.md, served at /<slug> by a three-line page file:
 *
 *   import { ReferencePage, referenceMetadata } from "@/components/reference-page";
 *   export const metadata = referenceMetadata("<slug>");
 *   export default function Page() { return <ReferencePage slug="<slug>" />; }
 *
 * Each file starts with front matter. Every field is required; a missing one fails the build.
 *
 *   ---
 *   title: Vercel deployment failed
 *   description: 70 to 170 characters for search results.
 *   published: 2026-11-19
 *   checked: 2026-11-19
 *   spooky: no
 *   ---
 *
 * `spooky` says whether Spooky catches this case, and picks the one fixed line under the banner
 * (SPOOKY_LINES in components/reference-page.tsx): no, deploy, runtime or site. The body itself
 * carries no Spooky sentence.
 *
 * The sitemap lists every file here on its own. The page shows the one-line Spooky banner above the text.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const SPOOKY_TIES = ["no", "deploy", "runtime", "site"] as const;
export type SpookyTie = (typeof SPOOKY_TIES)[number];
export type ReferencePage = { slug: string; title: string; description: string; published: string; checked: string; spooky: SpookyTie; body: string };

const DIR = path.join(process.cwd(), "content/reference");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Splits front matter from the body and checks every field. Throws with the file name on any fault. */
export function parseReference(slug: string, raw: string): ReferencePage {
  if (!SLUG.test(slug)) throw new Error(`reference ${slug}: slug must be lowercase words joined by hyphens`);
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, "\n"));
  if (!m) throw new Error(`reference ${slug}: missing front matter`);
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  const { title, description, published, checked, spooky } = fields;
  if (!title) throw new Error(`reference ${slug}: title is required`);
  if (!description || description.length < 70 || description.length > 170) throw new Error(`reference ${slug}: description must be 70 to 170 characters`);
  if (!DATE.test(published ?? "") || !DATE.test(checked ?? "")) throw new Error(`reference ${slug}: published and checked must be YYYY-MM-DD`);
  if (!SPOOKY_TIES.includes(spooky as SpookyTie)) throw new Error(`reference ${slug}: spooky must be one of ${SPOOKY_TIES.join(", ")}`);
  const body = m[2].trim();
  if (!body.startsWith("# ")) throw new Error(`reference ${slug}: the body must start with one # heading`);
  return { slug, title, description, published, checked, spooky: spooky as SpookyTie, body };
}

export function referencePage(slug: string): ReferencePage {
  return parseReference(slug, readFileSync(path.join(DIR, `${slug}.md`), "utf8"));
}

/** Reads only content/reference. A path from a parameter would make the build trace the whole project into every function. */
export function listReferencePages(): ReferencePage[] {
  let files: string[] = [];
  try { files = readdirSync(DIR).filter((f) => f.endsWith(".md")); } catch { return []; }
  return files.sort().map((f) => parseReference(f.slice(0, -3), readFileSync(path.join(DIR, f), "utf8")));
}
