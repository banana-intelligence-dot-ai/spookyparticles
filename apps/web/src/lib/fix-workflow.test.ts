import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";

const text = readFileSync(join(__dirname, "../../../../scripts/agent-inbox/spooky-fix.yml"), "utf8");
const wf = parse(text) as Record<string, unknown> & { jobs: { fix: { steps: { uses?: string; with?: Record<string, unknown> }[] } } };

it("the fix job lets Spooky's GitHub app start it (the action refuses bots by default)", () => {
  const action = wf.jobs.fix.steps.find((s) => s.uses?.startsWith("anthropics/claude-code-action"));
  expect(action?.with?.allowed_bots).toBe("spooky-particles");
});

it("the fix job runs only when dispatched, so an outside pull request cannot start it", () => {
  // The only top-level trigger key is "on", and its only event is workflow_dispatch.
  const triggerKeys = Object.keys(wf).filter((k) => !["name", "permissions", "concurrency", "jobs", "env", "defaults", "run-name"].includes(k));
  expect(triggerKeys).toEqual(["on"]);
  expect(Object.keys(wf.on as object)).toEqual(["workflow_dispatch"]);
});

it("the fix is judged by checks it can't edit, stops after three tries and says how it was verified", () => {
  const action = wf.jobs.fix.steps.find((s) => s.uses?.startsWith("anthropics/claude-code-action"));
  const prompt = String(action?.with?.prompt);
  expect(prompt).toContain("Never edit, skip or delete a test, CI workflow or check config");
  expect(prompt).toContain("After three attempts that fail, stop");
  expect(prompt).toContain('"Verified: <command> <result>"');
  expect(prompt).toContain("create it if it is missing");
  const guard = wf.jobs.fix.steps.find((s) => (s as { name?: string }).name === "Check the fix against the rules") as { if?: string; run?: string } | undefined;
  expect(guard?.if).toBe("always()");
  expect(guard?.run).toContain("^Verified: ");
});
