"use client";
import { useEffect, useRef, useState } from "react";
import { INCIDENT } from "./incident";

/**
 * The fix, just under the first screen: two entangled particles at the two edges, your app and your
 * agent, with the loop between them. It replays our own Nov 9 production failure: the app goes
 * red, Spooky catches it, the agent gets the cause, the agent pushes the real fix commit, and
 * Spooky sees both settle green. It starts when it scrolls into view, plays twice and rests on the
 * fix. Click either particle to replay. Still on "ok" under reduced motion or with ?still.
 */
type State = "idle" | "fail" | "know" | "ok";
const SEQUENCE: [State, number][] = [
  ["idle", 1400],
  ["fail", 1600],
  ["know", 3600],
  ["ok", 5200],
];
/** Full passes before it rests on "ok". */
const PASSES = 2;
/** What the agent got with the problem: the error the build log names, e.g. "WorkflowBuildError". */
const WHY = /\[(\w+)\]/.exec(INCIDENT.cause)?.[1] ?? "the build log";
const LINES: Record<State, { app: string; agent: string }> = {
  idle: { app: "running", agent: "working" },
  fail: { app: "deploy failed", agent: "working" },
  know: { app: "deploy failed", agent: "paged" },
  /** The agent gets the credit: d0c7f6c is the commit a coding agent pushed to fix it. */
  ok: { app: "working again", agent: `pushed ${INCIDENT.fixed.commit}` },
};
/** The log under the pair. Times only where the record has them (UTC); each line lights when the replay reaches it. */
const LOG: { at: State[]; time: string; text: string }[] = [
  { at: ["fail", "know", "ok"], time: INCIDENT.failed.failedAt, text: "Deploy fails on Vercel" },
  { at: ["know", "ok"], time: "", text: `Your agent gets the cause: ${WHY}` },
  { at: ["ok"], time: INCIDENT.fixed.readyAt, text: `Fix ${INCIDENT.fixed.commit} is live` },
  { at: ["ok"], time: "", text: `Spooky checks: fixed in ${INCIDENT.minutesToFix}` },
];

export function Particles({ title, titleId }: { title: string; titleId: string }) {
  const [state, setState] = useState<State>("ok");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(true);
  const root = useRef<HTMLDivElement>(null);

  const play = (from: number) => {
    if (timer.current) clearTimeout(timer.current);
    let i = from;
    let passes = 0;
    const step = () => {
      setState(SEQUENCE[i][0]);
      if (i === SEQUENCE.length - 1 && ++passes >= PASSES) return;
      timer.current = setTimeout(() => {
        i = (i + 1) % SEQUENCE.length;
        step();
      }, SEQUENCE[i][1]);
    };
    step();
  };

  useEffect(() => {
    const param = /still(?:=(\w+))?/.exec(window.location.search);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    still.current = Boolean(param) || reduced;
    if (still.current) {
      const s = param?.[1];
      if (s === "idle" || s === "fail" || s === "know" || s === "ok") setState(s);
      return;
    }
    setState("idle");
    const el = root.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        seen.disconnect();
        play(0);
      },
      { threshold: 0.45 },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const replay = () => {
    if (!still.current) return play(1);
    setState("fail");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("ok"), 1400);
  };

  const lines = LINES[state];
  return (
    <div ref={root} data-s={state} className="particles">
      <div className="pair">
        <i className="wire" aria-hidden />
        <figure className="node">
          <i className="orb orb-app" onClick={replay} aria-hidden />
          <figcaption aria-hidden>
            <b>your app</b>
            <span className="orb-state-app">{lines.app}</span>
          </figcaption>
        </figure>
        <figure className="node">
          <i className="orb orb-agent" onClick={replay} aria-hidden />
          <figcaption aria-hidden>
            <b>your agent</b>
            <span className="orb-state-agent">{lines.agent}</span>
          </figcaption>
        </figure>
      </div>
      <div className="fix-log">
        <h2 id={titleId} className="fix-title">
          {title}
        </h2>
        <ol>
          {LOG.map((l) => (
            <li key={l.text} data-on={l.at.includes(state) || undefined}>
              <time>{l.time}</time>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
