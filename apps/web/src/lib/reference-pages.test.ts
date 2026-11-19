import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listReferencePages, parseReference } from "./reference-pages";

const good = `---
title: Vercel deployment failed
description: A failed Vercel deploy leaves a build log, and the line that names the cause is near the end.
published: 2026-11-19
checked: 2026-11-19
spooky: site
---

# Vercel deployment failed

Body.`;

describe("parseReference", () => {
  it("reads the front matter and body", () => {
    const p = parseReference("vercel-deployment-failed", good);
    expect(p.title).toBe("Vercel deployment failed");
    expect(p.checked).toBe("2026-11-19");
    expect(p.spooky).toBe("site");
    expect(p.body.startsWith("# Vercel deployment failed")).toBe(true);
  });

  it("fails on a missing field, a bad date, a short description or a bad slug", () => {
    expect(() => parseReference("x", good.replace("title: Vercel deployment failed\n", ""))).toThrow(/title/);
    expect(() => parseReference("x", good.replace("checked: 2026-11-19", "checked: Nov 19"))).toThrow(/YYYY-MM-DD/);
    expect(() => parseReference("x", good.replace(/description: .*/, "description: too short"))).toThrow(/70 to 170/);
    expect(() => parseReference("Bad_Slug", good)).toThrow(/slug/);
    expect(() => parseReference("x", "# no front matter")).toThrow(/front matter/);
    expect(() => parseReference("x", good.replace("spooky: site", "spooky: maybe"))).toThrow(/spooky must be/);
    expect(() => parseReference("x", good.replace("spooky: site\n", ""))).toThrow(/spooky must be/);
  });
});

describe("reference files", () => {
  it("each has its page file, so no page is listed in the sitemap without a route", () => {
    for (const p of listReferencePages()) {
      expect(existsSync(path.join(process.cwd(), "src/app", p.slug, "page.tsx")), p.slug).toBe(true);
    }
  });
});
