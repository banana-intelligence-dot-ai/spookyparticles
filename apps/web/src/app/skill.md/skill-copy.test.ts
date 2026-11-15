import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// skills/spooky/SKILL.md is the copy that `npx skills add` and the Claude Code plugin install.
// It must match what spookyparticles.com/skill.md serves.
describe("spooky skill copy", () => {
  it("matches the served skill.md", () => {
    const served = readFileSync(path.join(process.cwd(), "content/skills/spooky/SKILL.md"), "utf8");
    const copy = readFileSync(path.join(process.cwd(), "../../skills/spooky/SKILL.md"), "utf8");
    expect(copy).toBe(served);
  });
});
