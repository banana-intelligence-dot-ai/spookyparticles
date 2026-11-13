/**
 * The words a person pastes to their coding agent for one Check finding. The agent takes that
 * finding, does what its instructions say (a pull request it never merges, or exact steps for the
 * person), and reports back. Spooky marks it fixed on its own next check, never on the agent's word.
 */
import { SITE } from "../today-model";
import type { Check } from "./check-view";

/** The id of a finding's row, so the matrix above can open and scroll to it. */
export const findingAnchor = (id: string) => `check-f-${id}`;

export function checkPrompt(project: { name: string; repo?: string | null }, c: Check): string {
  const where = project.repo ?? project.name;
  const pr = c.agent?.handoff !== "person";
  const auth = `-H "Authorization: Bearer $SPOOKY_API_KEY"`;
  const report = (body: string) => `curl -s -X POST ${auth} -H "Content-Type: application/json" -d '${body}' "${SITE}/api/v1/checks/${c.id}/report"`;
  return [
    `Spooky Particles found a gap in ${where}: ${c.title}.`,
    `Why it matters: ${c.why}`,
    "",
    `First tell Spooky you are on it: use the next_finding tool with finding_id ${c.id}, or run`,
    `curl -s -X POST ${auth} "${SITE}/api/v1/checks/${c.id}/take"`,
    "",
    c.agent ? `What to do: ${c.agent.instructions}` : null,
    `${c.agent ? "The fix" : "What to do"}: ${c.fix.text}`,
    ...(c.fix.steps ? ["", ...c.fix.steps, ""] : []),
    pr ? "Do not merge the pull request; I will." : null,
    c.agent?.personAfter ? `Then remind me: ${c.agent.personAfter}` : null,
    "",
    "Then report back: use the report_finding tool, or run",
    pr ? report(`{"outcome":"pr_opened","prUrl":"<the pull request link>"}`) : report(`{"outcome":"told_person"}`),
    "Spooky marks it fixed on its own once the change is live.",
    "If Spooky refuses because your key can only read, skip the Spooky steps and just do the work.",
    `If it should not be fixed, change nothing. Report "not_a_problem" with a one-line note, tell me why, and I will dismiss it in Spooky.`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}
