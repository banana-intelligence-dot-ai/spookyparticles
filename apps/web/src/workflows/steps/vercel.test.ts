import { describe, expect, it } from "vitest";
import { advanceRefusalProgress, refusalPersistence, type RefusalProgress } from "@/lib/vercel-refusals";

describe("syncVercelProjects refusal state", () => {
  it("lets account success win over a later project refusal", () => {
    let progress: RefusalProgress = { refused: false, read: false, skip: false };
    const readProjects: string[] = [];
    const read = (project: string, outcome: { refused: boolean; read: boolean }) => {
      if (progress.skip) return;
      readProjects.push(project);
      progress = advanceRefusalProgress(progress, outcome);
    };

    read("project A", { refused: false, read: true });
    read("project B", { refused: true, read: false });
    read("project C", { refused: false, read: true });

    expect(readProjects).toEqual(["project A", "project B", "project C"]);
    expect(progress).toEqual({ refused: true, read: true, skip: false });
    expect(refusalPersistence(progress)).toBe("clear");
  });
});
