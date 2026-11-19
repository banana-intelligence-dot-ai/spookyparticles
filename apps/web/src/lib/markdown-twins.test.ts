import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARKDOWN_CONTROLS, MARKDOWN_TWINS, markdownTwin } from "./markdown-twins";
import { GET } from "../app/md/[...path]/route";

const root = path.join(__dirname, "..", "..");

describe("markdown twins", () => {
  it("each twin is a real Markdown file starting with the page's heading, and no control page has a twin", () => {
    for (const t of MARKDOWN_TWINS) {
      expect(existsSync(path.join(root, t.file)), t.file).toBe(true);
      expect(readFileSync(path.join(root, t.file), "utf8").startsWith("# "), t.file).toBe(true);
    }
    for (const c of MARKDOWN_CONTROLS) expect(markdownTwin(c), c).toBeNull();
  });

  it("serves the exact file the page renders, as text/markdown, pointing back to the HTML page", async () => {
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const r = await GET(new Request("https://x/md/how/apps-across-hosts-and-logins"), { params: Promise.resolve({ path: ["how", "apps-across-hosts-and-logins"] }) });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(r.headers.get("link")).toBe('<https://spookyparticles.com/how/apps-across-hosts-and-logins>; rel="canonical"');
      expect(await r.text()).toBe(readFileSync(path.join(root, "content/how/apps-across-hosts-and-logins.md"), "utf8"));
      const miss = await GET(new Request("https://x/md/vibeops"), { params: Promise.resolve({ path: ["vibeops"] }) });
      expect(miss.status).toBe(404);
    } finally { process.chdir(cwd); }
  });
});
