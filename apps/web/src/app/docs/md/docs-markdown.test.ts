import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./[slug]/route";
import { DOCS_PAGES } from "../pages";

const call = (slug: string) => GET(new Request(`https://x.test/docs/md/${slug}`), { params: Promise.resolve({ slug }) });

describe("docs as markdown", () => {
  it("serves every docs page as its own markdown file", async () => {
    for (const p of DOCS_PAGES) {
      const res = await call(p.slug);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/markdown");
      expect(await res.text()).toBe(readFileSync(path.join(process.cwd(), "content/docs", `${p.slug}.md`), "utf8"));
    }
  });
  it("returns 404 for a slug that is not a docs page", async () => {
    expect((await call("nope")).status).toBe(404);
    expect((await call("../../package")).status).toBe(404);
  });
});
