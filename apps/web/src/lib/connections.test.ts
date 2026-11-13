import { describe, expect, it } from "vitest";
import { pickShownRun } from "./connections";

const done = (id: string) => ({ id, finishedAt: new Date("2026-11-12T21:36:00Z") });
const running = (id: string) => ({ id, finishedAt: null });

describe("pickShownRun", () => {
  it("shows a host's last finished run while a background refresh runs", () => {
    expect(pickShownRun("vercel", [running("new"), done("old")])).toEqual({ run: done("old"), refreshing: true });
    expect(pickShownRun("github", [running("new"), done("old")])).toEqual({ run: done("old"), refreshing: true });
  });

  it("shows a host's first sync while it runs", () => {
    expect(pickShownRun("vercel", [running("first")])).toEqual({ run: running("first"), refreshing: false });
  });

  it("keeps Gmail on the newest run so backfill progress stays visible", () => {
    expect(pickShownRun("gmail", [running("new"), done("old")])).toEqual({ run: running("new"), refreshing: false });
  });

  it("shows the newest run when it has finished, and nothing when there are no runs", () => {
    expect(pickShownRun("vercel", [done("new"), done("old")])).toEqual({ run: done("new"), refreshing: false });
    expect(pickShownRun("vercel", [])).toEqual({ run: null, refreshing: false });
  });
});
