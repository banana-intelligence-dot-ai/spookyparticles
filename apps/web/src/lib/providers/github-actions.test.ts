import { describe, expect, it } from "vitest";
import { actionsTailAndCause, failingStep, latestRunPerWorkflow, looksLikeDeploy, stateOfRun, type WorkflowRun } from "./github-actions";

const run = (over: Partial<WorkflowRun>): WorkflowRun => ({ id: 1, name: "Deploy", path: ".github/workflows/deploy.yml", head_branch: "main", head_sha: "abc", event: "push", status: "completed", conclusion: "success", created_at: "2026-11-09T20:00:00Z", updated_at: "2026-11-09T20:05:00Z", html_url: "https://github.com/o/r/actions/runs/1", ...over });

describe("latestRunPerWorkflow", () => {
  it("keeps the newest run per workflow on the default branch and ignores pull request runs", () => {
    const runs = [
      run({ id: 1, created_at: "2026-11-09T20:00:00Z" }),
      run({ id: 2, created_at: "2026-11-09T21:00:00Z", conclusion: "failure" }),
      run({ id: 3, path: ".github/workflows/test.yml", name: "Tests", created_at: "2026-11-09T21:30:00Z" }),
      run({ id: 4, created_at: "2026-11-09T22:00:00Z", event: "pull_request", head_branch: "feature" }),
      run({ id: 5, created_at: "2026-11-09T22:30:00Z", head_branch: "feature" }),
    ];
    const out = latestRunPerWorkflow(runs, "main");
    expect(out.map((r) => r.id)).toEqual([3, 2]);
  });
});

describe("stateOfRun and looksLikeDeploy", () => {
  it("maps conclusions onto the deployment vocabulary", () => {
    expect(stateOfRun({ status: "completed", conclusion: "success" })).toBe("success");
    expect(stateOfRun({ status: "completed", conclusion: "failure" })).toBe("failure");
    expect(stateOfRun({ status: "completed", conclusion: "cancelled" })).toBe("inactive");
    expect(stateOfRun({ status: "in_progress", conclusion: null })).toBe("in_progress");
    expect(stateOfRun({ status: "queued", conclusion: null })).toBe("queued");
  });
  it("tells deploy workflows from checks by name or path", () => {
    expect(looksLikeDeploy({ name: "Deploy Supabase functions", path: ".github/workflows/x.yml" })).toBe(true);
    expect(looksLikeDeploy({ name: "CI", path: ".github/workflows/test.yml" })).toBe(false);
  });
});

describe("failing step and log", () => {
  it("finds the failed job and step, strips timestamps and names the cause", () => {
    const f = failingStep([
      { id: 1, name: "lint", status: "completed", conclusion: "success", html_url: null },
      { id: 2, name: "deploy", status: "completed", conclusion: "failure", html_url: null, steps: [{ name: "Checkout", status: "completed", conclusion: "success", number: 1 }, { name: "supabase functions deploy", status: "completed", conclusion: "failure", number: 2 }] },
    ]);
    expect(f?.job.name).toBe("deploy");
    expect(f?.step).toBe("supabase functions deploy");
    const log = "2026-11-09T21:37:47.1234567Z ##[group]Run supabase functions deploy\n2026-11-09T21:37:48.0000000Z Deploying\n2026-11-09T21:37:49.0000000Z Error: Project ref not found: invalid project\n2026-11-09T21:37:49.5000000Z ##[error]Process completed with exit code 1.";
    const r = actionsTailAndCause(log, f?.step ?? null);
    expect(r.cause).toBe("Error: Project ref not found: invalid project");
    expect(r.tail[0]).toBe("Deploying");
    expect(r.tail.some((l) => l.startsWith("2026-"))).toBe(false);
  });
  it("falls back to the step name when the log says nothing useful", () => {
    expect(actionsTailAndCause("all good", "build").cause).toBe("all good");
    expect(actionsTailAndCause("", "build").cause).toBe("Step failed: build");
  });
});
