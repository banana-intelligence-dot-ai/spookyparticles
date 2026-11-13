import { describe, expect, it } from "vitest";
import { IGNORED, UNIGNORED, breakKey, ignoredFrom } from "./ignores";

const at = (m: number) => new Date(Date.UTC(2026, 10, 12, 12, m));

describe("ignoredFrom", () => {
  it("keeps a break ignored until a later undo, and names one failure, not the project", () => {
    const k1 = breakKey("node1", "2026-10-24T03:53:24.000Z");
    const k2 = breakKey("node1", "2026-11-12T09:00:00.000Z");
    expect(k1).not.toBe(k2);
    const rows = [
      { name: IGNORED, properties: { key: k1 }, createdAt: at(1) },
      { name: IGNORED, properties: { key: k2 }, createdAt: at(2) },
      { name: UNIGNORED, properties: { key: k2 }, createdAt: at(3) },
    ];
    expect([...ignoredFrom(rows)]).toEqual([k1]);
  });
});
