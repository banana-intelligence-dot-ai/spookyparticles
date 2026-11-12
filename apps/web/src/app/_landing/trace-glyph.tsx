/**
 * The hero trace, small: the same 1.5 px line and the same beat, drawn for one kind of trouble.
 * Used beside each thing the page watches. Decorative; the words beside it carry the meaning.
 */
type Kind = "uptime" | "schedule" | "deploy" | "check";

const B = 18;
const beat = (x: number, y = B) => `L${x - 4} ${y} L${x - 1} ${y - 9} L${x + 2} ${y + 4} L${x + 4} ${y}`;

const PATHS: Record<Kind, string> = {
  // a beat every check
  uptime: `M0 ${B} ${beat(16)} ${beat(40)} ${beat(64)} ${beat(88)} L112 ${B}`,
  // a beat, a beat, then none where one was due
  schedule: `M0 ${B} ${beat(16)} ${beat(40)} L112 ${B}`,
  // the failure: up hard, raised, back down
  deploy: `M0 ${B} L28 ${B} L30 2 L33 ${B + 5} L37 10 L78 10 L81 6 L85 ${B + 2} L88 ${B} L112 ${B}`,
  // five checks in a row
  check: `M0 ${B} ${beat(20)} ${beat(38)} ${beat(56)} ${beat(74)} ${beat(92)} L112 ${B}`,
};

export function TraceGlyph({ kind }: { kind: Kind }) {
  return (
    <svg viewBox="0 0 112 28" className="h-7 w-28 overflow-visible" aria-hidden fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={PATHS[kind]} stroke="var(--fg)" strokeOpacity={0.7} strokeWidth={1.5} />
      {kind === "deploy" ? <path d="M30 2 L33 23 L37 10 L78 10 L81 6" stroke="var(--red)" strokeWidth={1.5} /> : null}
      {kind === "schedule" ? <circle cx={64} cy={B} r={2.5} fill="var(--amber)" /> : null}
    </svg>
  );
}
