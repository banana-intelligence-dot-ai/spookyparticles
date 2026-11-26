import { beforeEach, describe, expect, it, vi } from "vitest";

const { appUrl } = vi.hoisted(() => ({ appUrl: vi.fn(() => "https://spookyparticles.com") }));
vi.mock("@/lib/env", () => ({ appUrl }));

import { setupMarkdown } from "./setup-markdown";

describe("setup markdown", () => {
  beforeEach(() => appUrl.mockReturnValue("https://spookyparticles.com"));

  it("uses the approved device flow when an agent needs write access", () => {
    const body = setupMarkdown();
    expect(body).toContain("run `sh scripts/spooky.sh start --write` and have your human approve write access on screen");
    expect(body).not.toContain("Ask your human to make one under https://spookyparticles.com/app/agents");
  });
});
