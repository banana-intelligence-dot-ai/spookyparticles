"use client";
import { useEffect, useRef, useState } from "react";
import { INCIDENT } from "./incident";

/**
 * The hero: two entangled particles at the two edges of the screen, your app and your agent.
 * It plays our own Nov 9 production failure: the app goes red, a beat later the agent knows,
 * then both settle green. Click either particle to replay. Still on "know" under reduced motion
 * or with ?still (screenshots).
 */
type State = "idle" | "fail" | "know" | "ok";
const SEQUENCE: [State, number][] = [
  ["idle", 1500],
  ["fail", 380],
  ["know", 3800],
  ["ok", 3800],
];
const FAILED = `deploy failed ${INCIDENT.failed.failedAt} UTC`;
const LINES: Record<State, { app: string; agent: string }> = {
  idle: { app: "running", agent: "working" },
  fail: { app: FAILED, agent: "working" },
  know: { app: FAILED, agent: "1 open problem" },
  ok: { app: `working again ${INCIDENT.fixed.readyAt} UTC`, agent: "working" },
};

export function Particles() {
  const [state, setState] = useState<State>("know");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(true);

  const play = (from: number) => {
    if (timer.current) clearTimeout(timer.current);
    let i = from;
    const step = () => {
      setState(SEQUENCE[i][0]);
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
    timer.current = setTimeout(() => setState("know"), 380);
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
      </p>
    </div>
  );
}
