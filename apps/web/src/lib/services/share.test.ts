import { expect, it } from "vitest";
import { shareOpportunities } from "./share";

it("suggests sharing when two projects each use a different service of the same kind", () => {
  const out = shareOpportunities([
    { name: "Neon", category: "database", projects: ["team/one"] },
    { name: "Supabase", category: "database", projects: ["team/two"] },
    { name: "Stripe", category: "payments", projects: ["team/one", "team/two"] },
  ]);
  expect(out).toEqual([{ category: "database", title: "These projects could share one database", line: "These projects could share one database: team/one (Neon), team/two (Supabase).",
    projects: [{ project: "team/one", service: "Neon" }, { project: "team/two", service: "Supabase" }] }]);
});

it("stays quiet for one project with two services, one shared service, and AI or API logins", () => {
  expect(shareOpportunities([{ name: "Neon", category: "database", projects: ["a"] }, { name: "Supabase", category: "database", projects: ["a"] }])).toEqual([]);
  expect(shareOpportunities([{ name: "Neon", category: "database", projects: ["a", "b"] }])).toEqual([]);
  expect(shareOpportunities([{ name: "OpenAI", category: "ai", projects: ["a"] }, { name: "Anthropic", category: "ai", projects: ["b"] }])).toEqual([]);
  expect(shareOpportunities([{ name: "Google", category: "api", projects: ["a"] }, { name: "GitHub", category: "api", projects: ["b"] }])).toEqual([]);
});
