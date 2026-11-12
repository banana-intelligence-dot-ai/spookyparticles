import { describe, expect, it } from "vitest";
import { parseBlocks } from "./legal-markdown";

describe("parseBlocks", () => {
  it("reads the subset the legal documents use", () => {
    const md = `# Title\n\n> **Draft.** Not legal advice.\n\nA paragraph\nthat wraps.\n\n## 1. Who\n\n- one\n- two\n\n1. first\n2. second\n\n| Data | How long |\n|---|---|\n| Tokens | Until revoked |\n`;
    const b = parseBlocks(md);
    expect(b.map((x) => x.kind)).toEqual(["heading", "quote", "paragraph", "heading", "list", "list", "table"]);
    expect(b[2]).toEqual({ kind: "paragraph", text: "A paragraph that wraps." });
    expect(b[4]).toEqual({ kind: "list", ordered: false, items: ["one", "two"] });
    expect(b[5]).toEqual({ kind: "list", ordered: true, items: ["first", "second"] });
    expect(b[6]).toEqual({ kind: "table", header: ["Data", "How long"], rows: [["Tokens", "Until revoked"]] });
  });
});
