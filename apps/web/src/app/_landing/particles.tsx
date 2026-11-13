"use client";
import { useEffect, useRef, useState } from "react";
import { INCIDENT } from "./incident";

/**
 * The hero: two entangled particles at the two edges of the screen, your app and your agent.
 * It plays our own Nov 9 production failure: the app goes red, a beat later the agent knows and
 * why (the error its build log names), then the agent pushes the real fix commit and both settle
 * green. It plays twice and rests on the fix. Click either particle to replay. Still on "know"
 * under reduced motion or with ?still (screenshots).
 */
type State = "idle" | "fail" | "know" | "ok";
const SEQUENCE: [State, number][] = [
  ["idle", 1500],
  ["fail", 1200],
  ["know", 3800],
  ["ok", 5200],
];
/** Full passes before it rests on "ok". */
const PASSES = 2;
const FAILED = `deploy failed ${INCIDENT.failed.failedAt} UTC`;
/** What the agent got with the problem: the error the build log names, e.g. "WorkflowBuildError". */
const WHY = `why: ${/\[(\w+)\]/.exec(INCIDENT.cause)?.[1] ?? "build log attached"}`;
const LINES: Record<State, { app: string; agent: string }> = {
  idle: { app: "running", agent: "working" },
  fail: { app: FAILED, agent: "working" },
  know: { app: FAILED, agent: "1 open problem" },
  /** The agent gets the credit: d0c7f6c is the commit a coding agent pushed to fix it. */
  ok: { app: `working again ${INCIDENT.fixed.readyAt} UTC`, agent: `pushed fix ${INCIDENT.fixed.commit}` },
};

export function Particles() {
  const [state, setState] = useState<State>("know");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(true);

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
    } else play(0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const replay = () => {
    if (!still.current) return play(1);
    setState("fail");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("know"), 1200);
  };

  const lines = LINES[state];
  return (
    <div data-s={state} className="particles" aria-hidden>
      <i className="orb orb-app" onClick={replay} />
      <i className="orb orb-agent" onClick={replay} />
      <p className="orb-label orb-label-app">
        <b>your app</b>
        <span className="orb-state-app">{lines.app}</span>
      </p>
      <p className="orb-label orb-label-agent">
        <b>your agent</b>
        <span className="orb-state-agent">{lines.agent}</span>
        <span className="orb-why">{WHY}</span>
      </p>
    </div>
  );
}
