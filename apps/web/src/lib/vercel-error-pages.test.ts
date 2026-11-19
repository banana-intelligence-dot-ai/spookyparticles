import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VERCEL_ERROR_PAGES } from "./vercel-error-pages";

describe("home page Vercel error links", () => {
  it("lists every vercel-* page, and only pages that exist", () => {
    const routes = readdirSync(path.join(__dirname, "..", "app")).filter((d) => d.startsWith("vercel-")).sort();
    expect(VERCEL_ERROR_PAGES.map((p) => p.slug).sort()).toEqual(routes);
    for (const p of VERCEL_ERROR_PAGES) expect(p.label.length, p.slug).toBeLessThanOrEqual(24);
  });
});
