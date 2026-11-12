/**
 * The hero trace, small: the same 1.5 px line and the same beat, drawn for one kind of trouble.
 * Used beside each thing the page watches. Decorative; the words beside it carry the meaning.
 */
export type GlyphKind = "uptime" | "schedule" | "deploy" | "check" | "handoff" | "confirm";

const B = 18;
const beat = (x: number, y = B) => `L${x - 4} ${y} L${x - 1} ${y - 9} L${x + 2} ${y + 4} L${x + 4} ${y}`;

const PATHS: Record<GlyphKind, string> = {
  // a beat every check
  uptime: `M0 ${B} ${beat(16)} ${beat(40)} ${beat(64)} ${beat(88)} L112 ${B}`,
  // a beat, a beat, then none where one was due
  schedule: `M0 ${B} ${beat(16)} ${beat(40)} L112 ${B}`,
  // the failure: up hard, raised, back down
  deploy: `M0 ${B} L28 ${B} L30 2 L33 ${B + 5} L37 10 L78 10 L81 6 L85 ${B + 2} L88 ${B} L112 ${B}`,
  // five checks in a row
  check: `M0 ${B} ${beat(20)} ${beat(38)} ${beat(56)} ${beat(74)} ${beat(92)} L112 ${B}`,
  // the failure, carried along the line to where the agent picks it up
  handoff: `M0 ${B} ${beat(14)} L28 ${B} L30 2 L33 ${B + 5} L36 ${B} L104 ${B}`,
  // raised while broken, a check at each beat, back down once one passes
  confirm: `M0 ${B} L14 ${B} L16 6 L19 ${B + 3} L22 10 ${beat(40, 10)} ${beat(62, 10)} L74 10 L77 6 L81 ${B + 2} L84 ${B} ${beat(100)} L112 ${B}`,
};

export function TraceGlyph({ kind }: { kind: GlyphKind }) {
  return (
    <svg viewBox="0 0 112 28" className="h-7 w-28 overflow-visible" aria-hidden fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={PATHS[kind]} stroke="var(--fg)" strokeOpacity={0.7} strokeWidth={1.5} />
      {kind === "deploy" ? <path d="M30 2 L33 23 L37 10 L78 10 L81 6" stroke="var(--red)" strokeWidth={1.5} /> : null}
      {kind === "schedule" ? <circle cx={64} cy={B} r={2.5} fill="var(--amber)" /> : null}
      {kind === "handoff" ? (
        <>
          <path d="M30 2 L33 23 L36 18" stroke="var(--red)" strokeWidth={1.5} />
          <circle cx={108} cy={B} r={3} fill="none" stroke="var(--fg)" strokeWidth={1.5} />
          <circle cx={108} cy={B} r={1} fill="var(--red)" />
        </>
      ) : null}
      {kind === "confirm" ? (
        <>
          <path d={`M16 6 L19 21 L22 10 L36 10 L39 1 L42 14 L44 10 L58 10 L61 1 L64 14 L66 10 L74 10 L77 6`} stroke="var(--red)" strokeWidth={1.5} />
          <circle cx={84} cy={B} r={2.5} fill="var(--live)" />
        </>
      ) : null}
    </svg>
  );
}
