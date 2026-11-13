import { describe, expect, it } from "vitest";
import { POSTAL_ADDRESS, withPostalFooter } from "./email";

describe("withPostalFooter", () => {
  it("ends text and html with the registered agent address", () => {
    const out = withPostalFooter({ to: "a@b.co", subject: "s", text: "Hello", html: "<html><body><p>Hi</p></body></html>" });
    expect(POSTAL_ADDRESS).toContain("131 Continental Dr, Suite 305, Newark, DE 19713, US");
    expect(out.text.endsWith(POSTAL_ADDRESS)).toBe(true);
    expect(out.html).toMatch(/131 Continental Dr[^]*<\/body><\/html>$/);
  });
  it("appends to html with no body tag", () => {
    expect(withPostalFooter({ to: "a@b.co", subject: "s", text: "t", html: "<pre>x</pre>" }).html).toContain(POSTAL_ADDRESS);
  });
});
