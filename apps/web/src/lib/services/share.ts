/**
 * Where two projects each pay for their own service of the same kind, for example
 * one database on Neon and another on Supabase. A read-only suggestion: Spooky
 * never moves anything.
 */
type Row = { name: string; category: string; projects: string[] };
export type ShareOpportunity = { category: string; title: string; line: string; projects: { project: string; service: string }[] };

/** Kinds where one account can serve several projects. AI models and API logins are left out on purpose. */
const NOUN: Record<string, string> = {
  database: "database", email: "email service", auth: "sign-in service", monitoring: "error tracker",
  analytics: "analytics service", payments: "payments account", storage: "storage service", realtime: "realtime service",
  search: "search service", media: "media service", maps: "maps service", messaging: "messaging service",
};

export function shareOpportunities(rows: Row[]): ShareOpportunity[] {
  const out: ShareOpportunity[] = [];
  for (const category of [...new Set(rows.map((r) => r.category))].sort()) {
    const noun = NOUN[category];
    if (!noun) continue;
    const uses = rows.filter((r) => r.category === category).flatMap((r) => r.projects.map((project) => ({ project, service: r.name })));
    // Two different projects on two different services. One project with two services, or many projects on one, is not it.
    const split = uses.some((a) => uses.some((b) => a.project !== b.project && a.service !== b.service));
    if (!split) continue;
    const projects = uses.sort((a, b) => a.project.localeCompare(b.project) || a.service.localeCompare(b.service));
    out.push({ category, title: `These projects could share one ${noun}`, line: `These projects could share one ${noun}: ${projects.map((p) => `${p.project} (${p.service})`).join(", ")}.`, projects });
  }
  return out;
}
