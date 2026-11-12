import { afterEach, describe, expect, it, vi } from "vitest";
import { LOG_TAIL_LINES, chooseDeployments, getProjectChecksInput, githubStateOf, listAccountDomains, logTailAndCause, looksLikeVercelToken, pickDeployment, pickProject, scopesOf, scrubLogLine, teamQuery } from "./vercel";

describe("listAccountDomains", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs every page in the team scope and keeps only registration facts", async () => {
    const calls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init: RequestInit) => {
      calls.push(new URL(url));
      expect(init.method).toBe("GET");
      return new Response(JSON.stringify(calls.length === 1
        ? { domains: [{ name: "Example.COM", boughtAt: 1, expiresAt: Date.parse("2027-01-01T00:00:00Z"), renew: true, secret: "discard" }], pagination: { next: 123 } }
        : { domains: [{ name: "external.com", expiresAt: null, renew: null }], pagination: { next: null } }), { status: 200 });
    }));
    expect(await listAccountDomains("token", { kind: "team", id: "team_1", slug: "team", name: "Team" })).toEqual([
      { name: "example.com", expiresAt: "2027-01-01T00:00:00.000Z", autoRenew: true, registeredHere: true },
      { name: "external.com", expiresAt: null, autoRenew: null, registeredHere: false },
    ]);
    expect(calls.map((url) => `${url.pathname}?${url.searchParams.get("teamId")}:${url.searchParams.get("until")}`)).toEqual(["/v5/domains?team_1:null", "/v5/domains?team_1:123"]);
  });
});

describe("pickProject", () => {
  const raw = {
    id: "prj_1",
    name: "spooky-particles",
    accountId: "team_9",
    framework: "nextjs",
    nodeVersion: "22.x",
    live: true,
    paused: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_760_000_000_000,
    env: [{ key: "DATABASE_URL", value: "postgres://secret", type: "encrypted" }],
    link: { type: "github", org: "banana-intelligence-dot-ai", repo: "spooky-particles", productionBranch: "master" },
    targets: { production: { id: "dpl_p", url: "spooky-particles-abc.vercel.app", readyState: "READY", createdAt: 1_760_000_000_000, readyAt: 1_760_000_050_000, source: "git", target: "production" } },
    latestDeployments: [
      { id: "dpl_old", url: "a.vercel.app", readyState: "READY", createdAt: 1_750_000_000_000, target: null },
      { id: "dpl_new", url: "b.vercel.app", readyState: "ERROR", createdAt: 1_761_000_000_000, target: null, errorCode: "BUILD_FAILED" },
    ],
  };

  it("keeps the map's fields and nothing from env", () => {
    const p = pickProject(raw);
    expect(p.id).toBe("prj_1");
    expect(p.repo).toEqual({ type: "github", org: "banana-intelligence-dot-ai", repo: "spooky-particles", repoId: null, productionBranch: "master" });
    expect(p.production?.url).toBe("https://spooky-particles-abc.vercel.app");
    expect(p.production?.state).toBe("READY");
    expect(p.production?.target).toBe("production");
    expect(JSON.stringify(p)).not.toContain("postgres://");
    expect(p.env).toEqual([{ key: "DATABASE_URL", targets: [], type: "encrypted" }]);
  });

  it("picks the newest of latestDeployments as latest, with its error code", () => {
    const p = pickProject(raw);
    expect(p.latest?.id).toBe("dpl_new");
    expect(p.latest?.state).toBe("ERROR");
    expect(p.latest?.errorCode).toBe("BUILD_FAILED");
    expect(p.latest?.target).toBe("preview");
  });

  it("tolerates a project with no link, no targets and no deployments", () => {
    const p = pickProject({ id: "prj_2", name: "bare", accountId: "u_1" });
    expect(p.repo).toBeNull();
    expect(p.production).toBeNull();
    expect(p.latest).toBeNull();
    expect(p.framework).toBeNull();
  });
  it("keeps the cron definition deployment for display", () => {
    expect(pickProject({ ...raw, crons: { deploymentId: "dpl_cron", definitions: [{ path: "/api/daily", schedule: "0 0 * * *" }] } }).cronDeploymentId).toBe("dpl_cron");
  });
});

describe("pickDeployment", () => {
  it("reads the deployments-list shape (uid, created, state)", () => {
    const d = pickDeployment({ uid: "dpl_x", url: "x.vercel.app", state: "CANCELED", created: 1_700_000_000_000, target: "production", source: "cli" });
    expect(d).toMatchObject({ id: "dpl_x", state: "CANCELED", target: "production", source: "cli", url: "https://x.vercel.app" });
    expect(d?.createdAt).toBe(new Date(1_700_000_000_000).toISOString());
  });
  it("returns null without an id", () => {
    expect(pickDeployment({ url: "x" })).toBeNull();
    expect(pickDeployment(null)).toBeNull();
  });
});

describe("scopes", () => {
  it("lists the personal account and every team for a full-account token", () => {
    const s = scopesOf({ scopes: [{ kind: "user", id: "u_1", slug: "nate", name: "nate" }, { kind: "team", id: "team_1", slug: "banana", name: "Banana" }] });
    expect(s.map((x) => x.id)).toEqual(["u_1", "team_1"]);
    expect(teamQuery(s[0])).toEqual({});
    expect(teamQuery(s[1])).toEqual({ teamId: "team_1" });
  });
  it("is one anonymous scope with no teamId for a scoped token", () => {
    const s = scopesOf({ scopes: [{ kind: "team", id: "scoped", slug: "scoped", name: "Scoped token" }] });
    expect(s).toHaveLength(1);
    expect(teamQuery(s[0])).toEqual({});
  });
});

describe("looksLikeVercelToken", () => {
  it("accepts an opaque token and rejects prose, spaces and short strings", () => {
    expect(looksLikeVercelToken("vcp_abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
    expect(looksLikeVercelToken("  vcp_abcdefghijklmnopqrstuvwxyz0123\n")).toBe(true);
    expect(looksLikeVercelToken("vcp_abc def")).toBe(false);
    expect(looksLikeVercelToken("short")).toBe(false);
    expect(looksLikeVercelToken("Bearer vcp_abcdefghijklmnopqrstuvwxyz0123")).toBe(false);
  });
});

describe("githubStateOf", () => {
  it("maps Vercel states onto the GitHub deployment vocabulary the rules read", () => {
    expect(githubStateOf("READY")).toBe("success");
    expect(githubStateOf("ERROR")).toBe("error");
    expect(githubStateOf("CANCELED")).toBe("inactive");
    expect(githubStateOf("BUILDING")).toBe("in_progress");
    expect(githubStateOf("QUEUED")).toBe("queued");
    expect(githubStateOf("BLOCKED")).toBe("pending");
    expect(githubStateOf(null)).toBeNull();
    expect(githubStateOf("SOMETHING_NEW")).toBe("something_new");
  });
});

describe("repo link and chooseDeployments", () => {
  const base = { id: "prj_1", name: "x", accountId: "a", framework: null, nodeVersion: null, live: true, paused: false, createdAt: null, updatedAt: "2026-10-01T00:00:00.000Z", repo: null, production: null, latest: null };
  const dep = (id: string, over: Partial<ReturnType<typeof pickDeployment>> & { createdAt: string }) =>
    ({ id, url: null, state: "READY", target: "preview" as const, readyAt: null, source: null, errorCode: null, inspectorUrl: null, ...over }) as NonNullable<ReturnType<typeof pickDeployment>>;

  it("keeps GitHub's numeric repo id as a string", () => {
    const p = pickProject({ id: "prj_1", name: "x", accountId: "a", link: { type: "github", org: "o", repo: "r", repoId: 123456 } });
    expect(p.repo?.repoId).toBe("123456");
  });

  it("prefers the project's own production target over a newer READY production deploy (rollbacks)", () => {
    const rolledBackTo = dep("dpl_old", { target: "production", createdAt: "2026-09-01T00:00:00.000Z" });
    const newer = dep("dpl_new", { target: "production", createdAt: "2026-10-01T00:00:00.000Z" });
    const r = chooseDeployments({ ...base, production: rolledBackTo }, [newer, rolledBackTo]);
    expect(r.production?.id).toBe("dpl_old");
    expect(r.latest?.id).toBe("dpl_new");
  });

  it("falls back to the newest READY production deploy when the project has no target, and finds the newest failure", () => {
    const fail = dep("dpl_f", { state: "ERROR", createdAt: "2026-10-03T00:00:00.000Z", errorCode: "BUILD_FAILED" });
    const ok = dep("dpl_ok", { target: "production", createdAt: "2026-10-02T00:00:00.000Z" });
    const r = chooseDeployments(base, [ok, fail]);
    expect(r.production?.id).toBe("dpl_ok");
    expect(r.lastFailure?.id).toBe("dpl_f");
    expect(r.newestPreview?.id).toBe("dpl_f");
  });
});

describe("build log tail and cause", () => {
  it("names the failing line over the boilerplate that follows it, and keeps the last lines", () => {
    const events = [
      { text: "Running \"npm run build\"" },
      { text: "> next build" },
      { text: "./src/app/page.tsx:12:5\nType error: Property 'foo' does not exist on type 'Bar'." },
      { text: "Error: Command \"npm run build\" exited with 1" },
    ];
    const r = logTailAndCause(events);
    expect(r.cause).toBe("Type error: Property 'foo' does not exist on type 'Bar'.");
    expect(r.tail[r.tail.length - 1]).toBe('Error: Command "npm run build" exited with 1');
    expect(r.tail.length).toBeLessThanOrEqual(LOG_TAIL_LINES);
  });

  it("names the error headline over npm's lifecycle lines and mid-sentence mentions (our own 149449c build, Nov 9)", () => {
    const events = [
      { text: "> Build error occurred" },
      { text: "Error [WorkflowBuildError]: Workflow bundle cannot run in the workflow sandbox." },
      { text: "Workflow functions are evaluated in a sandbox without `require`. The bundle below still contains" },
      { text: "`require()` calls, which throw `ReferenceError: require is not defined` when the bundle is loaded." },
      { text: "Imports left external (2):" },
      { text: "Learn more: https://workflow-sdk.dev/err/node-js-module-in-workflow" },
      { text: "  cause: undefined," },
      { text: "npm error Lifecycle script `build` failed with error:" },
      { text: "npm error code 1" },
      { text: "npm error path /vercel/path0/apps/web" },
      { text: "npm error command failed" },
      { text: "npm error command sh -c next build" },
      { text: 'Error: [BUILD_UTILS_SPAWN_1] Command "npm run build" exited with 1' },
    ];
    expect(logTailAndCause(events).cause).toBe("Error [WorkflowBuildError]: Workflow bundle cannot run in the workflow sandbox.");
  });

  it("falls back to the boilerplate line, then the last line", () => {
    expect(logTailAndCause([{ text: "Installing" }, { text: "Error: Command \"npm run build\" exited with 1" }]).cause).toBe('Error: Command "npm run build" exited with 1');
    expect(logTailAndCause([{ text: "all good" }]).cause).toBe("all good");
    expect(logTailAndCause([]).cause).toBeNull();
  });

  it("scrubs secrets a build log might echo", () => {
    expect(scrubLogLine("DATABASE_URL=postgres://user:pw@host/db")).toBe("DATABASE_URL=[redacted]");
    expect(scrubLogLine("connecting to postgresql://user:pw@host:5432/db now")).toBe("connecting to postgresql://[redacted] now");
    expect(scrubLogLine("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123")).toBe("Authorization: Bearer [redacted]");
    expect(scrubLogLine(`using key ${"sk_" + "live_"}abcdefghijklmnopqrstuvwxyz`)).toBe("using key [redacted]");
    expect(scrubLogLine("STRIPE_SECRET: whsec_123456789")).toBe("STRIPE_SECRET=[redacted]");
    expect(scrubLogLine("\u001b[31mError\u001b[0m: boom")).toBe("Error: boom");
    expect(scrubLogLine("plain line stays").length).toBe(16);
  });
});

describe("commit metadata and the richer production record", () => {
  it("reads the commit from Vercel's git metadata and keeps the first line of the message", () => {
    const d = pickDeployment({ uid: "dpl_c", url: "c.vercel.app", state: "READY", created: 1_700_000_000_000, target: "production", meta: { githubCommitSha: "44c44fa9deadbeef", githubCommitRef: "main", githubCommitMessage: "Fix the thing\n\nLonger body" } });
    expect(d?.commit).toEqual({ sha: "44c44fa9deadbeef", ref: "main", message: "Fix the thing" });
    expect(pickDeployment({ uid: "dpl_n", created: 1 })?.commit).toBeNull();
  });
  it("uses the deployments-list record of the production target when both are present", () => {
    const base = { id: "prj", name: "x", accountId: "a", framework: null, nodeVersion: null, live: true, paused: false, createdAt: null, updatedAt: null, repo: null, latest: null };
    const thin = { id: "dpl_p", url: "https://p.vercel.app", state: "READY", target: "production" as const, createdAt: "2026-11-04T07:21:56.000Z", readyAt: null, source: null, errorCode: null, inspectorUrl: null, commit: null };
    const rich = { ...thin, inspectorUrl: "https://vercel.com/t/x/dpl_p", source: "git", commit: { sha: "abc1234", ref: "main", message: "m" } };
    const r = chooseDeployments({ ...base, production: thin }, [rich]);
    expect(r.production?.inspectorUrl).toBe("https://vercel.com/t/x/dpl_p");
    expect(r.production?.commit?.sha).toBe("abc1234");
  });
});

describe("getProjectChecksInput", () => {
  afterEach(() => vi.unstubAllGlobals());
  const scope = { kind: "team" as const, id: "team_1", slug: "t", name: "T" };
  const project = { id: "prj_1", name: "site", ssoProtection: { deploymentType: "all_except_custom_domains" } };

  it("reads a project with no variables as an empty list, not as unreadable", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ envs: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const got = await getProjectChecksInput("tok", scope, "prj_1");
    expect(got.env).toEqual([]);
    expect(got.protection?.ssoProtection?.deploymentType).toBe("all_except_custom_domains");
    expect(String(fetcher.mock.calls[1][0])).toBe("https://api.vercel.com/v10/projects/prj_1/env?teamId=team_1");
    expect(fetcher.mock.calls[1][1].method).toBe("GET");
  });

  it("drops values from the list and keeps names, targets and types", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ envs: [{ key: "API_KEY", value: "do-not-keep", type: "encrypted", target: ["production"] }] }), { status: 200 })));
    const got = await getProjectChecksInput("tok", scope, "prj_1");
    expect(got.env).toEqual([{ key: "API_KEY", targets: ["production"], type: "encrypted" }]);
    expect(JSON.stringify(got)).not.toContain("do-not-keep");
  });

  it("keeps unreadable when the list is refused, and still returns protection", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 200 }))
      .mockResolvedValueOnce(new Response("denied", { status: 403 })));
    const got = await getProjectChecksInput("tok", scope, "prj_1");
    expect(got.env).toBeNull();
    expect(got.protection).not.toBeNull();
  });

  it("does not ask twice when the project already carries its list", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...project, env: [{ key: "A", type: "plain", target: "preview" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const got = await getProjectChecksInput("tok", scope, "prj_1");
    expect(got.env).toEqual([{ key: "A", targets: ["preview"], type: "plain" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
