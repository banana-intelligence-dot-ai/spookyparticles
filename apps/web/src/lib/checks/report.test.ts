import { expect, it } from "vitest";
import type { schema } from "@/db";
import { checkReport, linkedRepo } from "./report";

it("returns the API shape, five checks, setting links and an open-first order", () => {
  const node = (id: string, name: string) => ({ id, kind: "project", externalKey: `vercel:project:${id}`, name, attributes: { scope_slug: "team", production_url: "https://example.com" } }) as unknown as typeof schema.nodes.$inferSelect;
  const row = { id: "row", nodeId: "b", check: "previews_open", state: "open", reason: null, source: "verified", evidence: {}, firstOpenAt: new Date(), fixedAt: null, dismissedAt: null, checkedAt: new Date() } as typeof schema.projectChecks.$inferSelect;
  const result = checkReport([node("a", "alpha"), node("b", "beta")], [row], true);
  expect(result).toMatchObject({ ready: true, summary: { projects: 2, open: 1, fixed: 0, unknown: 9 } });
  expect(result.projects[0]).toMatchObject({ name: "beta", productionUrl: "https://example.com" });
  expect(result.projects[0].checks).toHaveLength(5);
  expect(result.projects[0].checks.map((c) => c.check)).toEqual(["secret_in_public_code", "previews_open", "cron_unguarded", "secret_not_sensitive", "deps_not_updated"]);
  expect(result.projects[0].checks[1]).toMatchObject({ id: "row", source: "verified", title: "Preview links are open to the world", fix: { settingUrl: "https://vercel.com/team/beta/settings/deployment-protection" } });
  // A check with no row yet has no answer: neutral name, "not checked yet", never a guessed reason.
  expect(result.projects[0].checks[3]).toMatchObject({ id: null, state: "unknown", reason: "check_pending", title: "Secret storage" });
  const passing = checkReport([node("b", "beta")], [{ ...row, state: "ok" }], true);
  expect(passing.projects[0].checks[1].title).toBe("Preview links are protected");
  const unknownSlug = checkReport([{ ...node("c", "gamma"), attributes: { scope_slug: "scoped" } }], [], true);
  expect(unknownSlug.projects[0].checks[1].fix).not.toHaveProperty("settingUrl");
});

it("makes the words specific where the evidence allows, and marks an exposed key as the serious kind", async () => {
  const { wordsFor, CHECK_CATALOG } = await import("./catalog");
  expect(wordsFor("secret_not_sensitive", { names: ["A_SECRET", "B_TOKEN"] }).title).toBe("2 secrets can be read back from your Vercel settings");
  expect(wordsFor("secret_not_sensitive", { names: ["A_SECRET"] }).title).toBe(CHECK_CATALOG.secret_not_sensitive.title);
  expect(wordsFor("secret_in_public_code", { hits: [{ pattern: "Stripe live secret key", path: "/a.js" }] }).fixText).toContain("in Stripe now");
  // Two providers, or a kind with no certain provider: stay general rather than guess.
  expect(wordsFor("secret_in_public_code", { hits: [{ pattern: "Stripe live secret key", path: "/a.js" }, { pattern: "OpenAI key", path: "/b.js" }] }).fixText).toBe(CHECK_CATALOG.secret_in_public_code.fix.text);
  expect(wordsFor("secret_in_public_code", { hits: [{ pattern: "Private key", path: "/a.js" }] }).fixText).toBe(CHECK_CATALOG.secret_in_public_code.fix.text);
  expect(CHECK_CATALOG.secret_in_public_code.severity).toBe("exposed");
  expect(wordsFor("deps_not_updated", { files: [".github/dependabot.yml"] }).okTitle).toBe("Dependabot is set up");
  expect(wordsFor("deps_not_updated", { files: ["renovate.json"] }).okTitle).toBe("Renovate is set up");
  expect(wordsFor("deps_not_updated", {}).okTitle).toBe(CHECK_CATALOG.deps_not_updated.okTitle);
});

// Found live on the first handoff: the agent got no repo, because this read a shape the sync never writes.
// These attributes are the ones syncVercelProject stores (repo as "org/name", repo_provider beside it).
it("names the linked GitHub repo from the attributes the Vercel sync stores", () => {
  const node = (attributes: Record<string, unknown>) => ({ id: "a", kind: "project", externalKey: "vercel:project:a", name: "alpha", attributes }) as unknown as typeof schema.nodes.$inferSelect;
  expect(linkedRepo(node({ repo: "acme/site", repo_provider: "github", repo_external_id: "1" }))).toBe("acme/site");
  expect(checkReport([node({ repo: "acme/site", repo_provider: "github" })], [], true).projects[0].repo).toBe("acme/site");
  expect(linkedRepo(node({ repo: "acme/site", repo_provider: "gitlab" }))).toBeNull();
  expect(linkedRepo(node({ repo: null, repo_provider: null }))).toBeNull();
  expect(linkedRepo(node({ repo: "acme/site/extra", repo_provider: "github" }))).toBeNull();
  expect(linkedRepo(node({ repo: { org: "acme", repo: "site", type: "github" } }))).toBeNull();
});
