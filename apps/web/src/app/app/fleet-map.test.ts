import { describe, expect, it } from "vitest";
import { fleetGroups } from "./fleet-map";
import type { Project } from "./project-model";

const p = (name: string, health: Project["health"], monthlyCents: number | null = null) => ({ id: name, name, health, monthlyCents }) as unknown as Project;

describe("fleetGroups", () => {
  it("groups by what each project needs, worst and costliest first, and drops empty groups", () => {
    const out = fleetGroups([p("a", "ok", 100), p("b", "attention"), p("c", "failed"), p("d", "ok", 900), p("e", "archived"), p("f", "idle", 50)]);
    expect(out.map((x) => [x.g.key, x.list.map((y) => y.name)])).toEqual([
      ["need", ["c", "b"]],
      ["run", ["d", "a"]],
      ["quiet", ["f", "e"]],
    ]);
  });
});
