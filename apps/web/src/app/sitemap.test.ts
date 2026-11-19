import { describe, expect, it } from "vitest";
import sitemap, { PUBLIC_PAGES } from "./sitemap";

describe("sitemap", () => {
  it("gives every page a real past ISO lastModified date", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const p of PUBLIC_PAGES) {
      expect(p.lastModified, p.path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(p.lastModified).toISOString().slice(0, 10), p.path).toBe(p.lastModified);
      expect(p.lastModified <= today, p.path).toBe(true);
    }
  });

  it("lists each path once and carries lastModified into the output", () => {
    expect(new Set(PUBLIC_PAGES.map((p) => p.path)).size).toBe(PUBLIC_PAGES.length);
    const out = sitemap();
    expect(out).toHaveLength(PUBLIC_PAGES.length);
    for (const e of out) expect(e.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
