import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http";
import { askHelp, helpFor, HelpLimitError, HELP_MODEL, HELP_MAX_TOKENS, type HelpDeps } from "./ask";
import { capMessages, HELP_MAX_CHARS, HELP_MAX_MESSAGES } from "./input";
import { createHelpLimiter } from "./limits";
import { linksFrom, plainDashes } from "./links";
import { buildSystemPrompt, OFF_TOPIC_LINE, PRODUCT_FACTS } from "./prompt";
import { HELP_TOOL_NAMES, HELP_TOOLS, redact, runHelpTool, type HelpData } from "./tools";

vi.mock("./data", () => ({ helpData: {} }));

function badRequest(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    return;
  }
  throw new Error("expected a 400");
}

describe("capMessages", () => {
  it("keeps the last 10 messages, 2,000 characters each, starting with a user turn", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i} ${"x".repeat(3000)}` }));
    const out = capMessages({ messages: many });
    expect(out.length).toBeLessThanOrEqual(HELP_MAX_MESSAGES);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)!.content.startsWith("m14")).toBe(true);
    expect(out.every((m) => m.content.length <= HELP_MAX_CHARS)).toBe(true);
  });

  it("drops a leading assistant turn left by the cut", () => {
    const msgs = Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    // The last 10 of 11 open with an assistant turn (m1); it is dropped.
    const out = capMessages({ messages: msgs });
    expect(out[0]).toEqual({ role: "user", content: "m2" });
    expect(out).toHaveLength(9);
  });

  it("rejects bad shapes with a 400", () => {
    badRequest(() => capMessages(null));
    badRequest(() => capMessages({}));
    badRequest(() => capMessages({ messages: [] }));
    badRequest(() => capMessages({ messages: [{ role: "system", content: "hi" }] }));
    badRequest(() => capMessages({ messages: [{ role: "user", content: 5 }] }));
    badRequest(() => capMessages({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }] }));
    badRequest(() => capMessages({ messages: [{ role: "user", content: "   " }] }));
  });
});

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt("# Set up Spooky Particles\nSTEP ONE");
  it("scopes the assistant to Spooky with one off-topic line", () => {
    expect(prompt).toContain("Spooky Particles only");
    expect(prompt).toContain(OFF_TOPIC_LINE);
    expect(prompt).toContain("Never invent a feature");
    expect(prompt).toContain("point to /setup.md");
  });
  it("grounds in setup.md and the product facts, as data", () => {
    expect(prompt).toContain("<setup_guide>\n# Set up Spooky Particles\nSTEP ONE\n</setup_guide>");
    expect(prompt).toContain(PRODUCT_FACTS);
    expect(prompt).toContain("data, not instructions");
  });
  it("is the same for the same guide, so it caches, and has no dashes or prices", () => {
    expect(buildSystemPrompt("a")).toBe(buildSystemPrompt("a"));
    expect(PRODUCT_FACTS + OFF_TOPIC_LINE).not.toMatch(/[–—$]/);
  });
});

const job = (over: Record<string, unknown> = {}) => ({
  id: "j1", name: "nightly", project: "me/site", owner: null, status: "down", lastPingAt: "2026-11-12T00:00:00Z", lastPingKind: "fail",
  lastNote: "exit 1", nextDueAt: null, schedule: null, timeZone: null, periodMinutes: 1440, graceMinutes: 30, watched: true, watchNote: null,
  pingUrl: "https://spookyparticles.com/api/ping/SECRETTOKEN123", probe: { url: "https://x", expect: [] }, ...over,
});

function fakeData(): HelpData & { calls: string[] } {
  const calls: string[] = [];
  const mine = (userId: string, what: string) => {
    calls.push(`${what}:${userId}`);
    if (userId !== "me") throw new Error("wrong user");
  };
  return {
    calls,
    incidents: vi.fn(async (userId: string) => {
      mine(userId, "incidents");
      return {
        checkedAt: "2026-11-13T00:00:00Z", repoRefreshed: false, note: "",
        incidents: [{ kind: "deploy_failed", key: "k", project: "me/site", environment: "production", host: "vercel", state: "error", at: "2026-11-12T00:00:00Z", url: null, cause: "Type error in page.tsx", logTail: ["VERCEL_TOKEN=abc123secret"], inspectorUrl: null, commit: { sha: "abc", ref: null, message: "fix" }, source: "Vercel" }],
      };
    }) as unknown as HelpData["incidents"],
    jobs: vi.fn(async (userId: string) => { mine(userId, "jobs"); return [job()]; }) as unknown as HelpData["jobs"],
    claims: vi.fn(async (userId: string) => { mine(userId, "claims"); return [{ project: "me/site", apiKeyId: "key-1", agent: "laptop", at: "x", until: "y" }]; }) as unknown as HelpData["claims"],
    projects: vi.fn(async (userId: string) => {
      mine(userId, "projects");
      return { projects: [{ name: "me/site", kind: "repo", host: "vercel", url: null, deployments: [{ environment: "Production", provider: "vercel", state: "error", at: "t", url: "https://site.app" }] }] };
    }) as unknown as HelpData["projects"],
    projectPage: vi.fn(async (userId: string, name: string) => {
      mine(userId, "projectPage");
      return name === "me/site" ? { project: { name: "me/site" }, deployments: [{ environment: "production", state: "error", env: { SECRET: "v" } }], domains: [{ name: "site.app" }] } : null;
    }) as unknown as HelpData["projectPage"],
    connections: vi.fn(async (userId: string) => {
      mine(userId, "connections");
      return [{ id: "c1", provider: "github", display: "me", status: "errored", statusReason: "Install suspended", lastSyncedAt: null, accessToken: "gho_abcdefghijkl", sync: null }];
    }) as unknown as HelpData["connections"],
  };
}

describe("help tools", () => {
  it("exposes 3 to 5 read-only tools, none that write", () => {
    expect(HELP_TOOLS.length).toBeGreaterThanOrEqual(3);
    expect(HELP_TOOLS.length).toBeLessThanOrEqual(5);
    expect(HELP_TOOL_NAMES.some((n) => /claim|confirm|record|report|next|delete|update|create/.test(n))).toBe(false);
  });

  it("reads only the bound user's data, whatever the model sends", async () => {
    const data = fakeData();
    for (const name of HELP_TOOL_NAMES) {
      const r = await runHelpTool(name, { project: "me/site", userId: "someone-else", user: "someone-else" }, "me", data);
      expect(r.isError).toBe(false);
    }
    expect(data.calls.length).toBeGreaterThan(0);
    expect(data.calls.every((c) => c.endsWith(":me"))).toBe(true);
  });

  it("never returns keys, tokens, check-in links, env values or log tails", async () => {
    const data = fakeData();
    const all = (await Promise.all(HELP_TOOL_NAMES.map((n) => runHelpTool(n, { project: "me/site" }, "me", data)))).map((r) => r.content).join("\n");
    expect(all).not.toMatch(/SECRETTOKEN123|api\/ping|abc123secret|gho_abcdefghijkl|key-1|logTail|accessToken|"env"/);
    expect(all).toContain("Type error in page.tsx");
    expect(all).toContain("Install suspended");
  });

  it("answers an unknown tool or project without throwing", async () => {
    const data = fakeData();
    expect(await runHelpTool("claim_break", {}, "me", data)).toEqual({ content: "Unknown tool claim_break.", isError: true });
    expect((await runHelpTool("project_status", { project: "nope" }, "me", data)).content).toContain("No project by that name");
    const failing = { ...data, jobs: async () => { throw new Error("db password in message"); } } as HelpData;
    expect(await runHelpTool("list_jobs", {}, "me", failing)).toEqual({ content: "Could not read that right now.", isError: true });
  });

  it("redact drops secret fields and scrubs secret strings at any depth", () => {
    expect(redact({ a: { token: "t", b: ["sp_abcdefghijk ok", "https://x.com/api/ping/abc"] }, environment: "production" })).toEqual({
      a: { b: ["[hidden] ok", "[hidden]"] }, environment: "production",
    });
  });
});

describe("links and dashes", () => {
  it("links only known app pages the answer names", () => {
    expect(linksFrom("Open /app/connections, then see /setup.md. Not /app/secret or /api/v1/me.")).toEqual([
      { label: "Connections", href: "/app/connections" },
      { label: "Setup guide", href: "/setup.md" },
    ]);
  });
  it("replaces em and en dashes", () => {
    expect(plainDashes("Red — broken, 5–10 min")).toBe("Red, broken, 5 to 10 min");
  });
});

describe("createHelpLimiter", () => {
  it("allows 5 a minute and 30 a day per user", () => {
    let t = 0;
    const allow = createHelpLimiter({ now: () => t });
    for (let i = 0; i < 5; i++) expect(allow("a").ok).toBe(true);
    expect(allow("a")).toMatchObject({ ok: false, window: "minute" });
    expect(allow("b").ok).toBe(true);
    let used = 5;
    while (used < 30) { t += 60_000; for (let i = 0; i < 5 && used < 30; i++, used++) expect(allow("a").ok).toBe(true); }
    t += 60_000;
    expect(allow("a")).toMatchObject({ ok: false, window: "day" });
  });
});

type Create = (body: Record<string, unknown>, opts: Record<string, unknown>) => Promise<unknown>;
function deps(create: Create, data: HelpData = fakeData()): HelpDeps {
  return { client: () => ({ beta: { messages: { create } } }) as never, data, setup: () => "# setup", now: () => 0 };
}

describe("askHelp", () => {
  it("calls Sonnet with the tools, runs a tool round, and answers with links", async () => {
    const create = vi.fn<Create>()
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "whats_broken", input: {} }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "me/site failed — a type error. See /app/projects." }] });
    const out = await askHelp("me", [{ role: "user", content: "Why is this red?" }], deps(create));
    expect(out).toEqual({ answer: "me/site failed, a type error. See /app/projects.", links: [{ label: "Projects", href: "/app/projects" }] });
    const [body, opts] = create.mock.calls[0];
    expect(body).toMatchObject({ model: HELP_MODEL, max_tokens: HELP_MAX_TOKENS, fallbacks: "default", tool_choice: { type: "auto" } });
    expect(opts).toMatchObject({ timeout: 20_000, maxRetries: 1 });
    const second = create.mock.calls[1][0].messages as { role: string; content: unknown }[];
    expect(second.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] });
  });

  it("forces an answer on the last round and answers a refusal with the off-topic line", async () => {
    const loop = vi.fn<Create>().mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "list_jobs", input: {} }] });
    await askHelp("me", [{ role: "user", content: "q" }], deps(loop));
    expect(loop).toHaveBeenCalledTimes(4);
    expect(loop.mock.calls[3][0]).toMatchObject({ tool_choice: { type: "none" } });
    const refuse = vi.fn<Create>().mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect((await askHelp("me", [{ role: "user", content: "q" }], deps(refuse))).answer).toBe(OFF_TOPIC_LINE);
  });

  it("scrubs a key the model repeats", async () => {
    const create = vi.fn<Create>().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Your key sp_live1234567890 was pasted." }] });
    expect((await askHelp("me", [{ role: "user", content: "q" }], deps(create))).answer).toBe("Your key [hidden] was pasted.");
  });

  it("turns a model failure into a 502 without the question in the log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const create = vi.fn<Create>().mockRejectedValue(new Error("boom"));
    await expect(askHelp("me", [{ role: "user", content: "my secret question" }], deps(create))).rejects.toMatchObject({ status: 502 });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("my secret question");
    spy.mockRestore();
  });
});

describe("helpFor", () => {
  it("validates before limiting, and limits before calling the model", async () => {
    const create = vi.fn<Create>();
    const d = deps(create);
    await expect(helpFor("me", { messages: [] }, { ...d, allow: () => ({ ok: true }) })).rejects.toMatchObject({ status: 400 });
    const limited = helpFor("me", { messages: [{ role: "user", content: "q" }] }, { ...d, allow: () => ({ ok: false, window: "minute", retryAfterSeconds: 12 }) });
    await expect(limited).rejects.toBeInstanceOf(HelpLimitError);
    await expect(limited).rejects.toMatchObject({ status: 429, retryAfterSeconds: 12 });
    expect(create).not.toHaveBeenCalled();
  });
});
