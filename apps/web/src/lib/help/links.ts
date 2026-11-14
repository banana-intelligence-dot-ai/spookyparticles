/**
 * Links come from a fixed list of app pages, picked by the paths the answer
 * names. The model never makes up a link: an unknown path is just text.
 */
export type HelpLink = { label: string; href: string };

export const HELP_PAGES: Record<string, string> = {
  "/app": "Today",
  "/app/projects": "Projects",
  "/app/check": "Check",
  "/app/activity": "History",
  "/app/jobs": "Schedules",
  "/app/connections": "Connections",
  "/app/expirations": "Expirations",
  "/setup.md": "Setup guide",
};

const PATH = /(?:^|[\s(`"'])(?:https?:\/\/[^\s/`"')]+)?(\/(?:app(?:\/[a-z-]+)?|setup\.md))(?=$|[\s).,;:!?`"'])/g;

export function linksFrom(answer: string, max = 3): HelpLink[] {
  const seen = new Set<string>();
  const out: HelpLink[] = [];
  for (const m of answer.matchAll(PATH)) {
    const href = m[1];
    if (seen.has(href) || !HELP_PAGES[href]) continue;
    seen.add(href);
    out.push({ label: HELP_PAGES[href], href });
    if (out.length >= max) break;
  }
  return out;
}

/** House copy has no em or en dashes. Ranges become "to", other dashes a comma. */
export function plainDashes(text: string): string {
  return text.replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2").replace(/\s*[–—]\s*/g, ", ");
}
