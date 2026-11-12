import { test } from "node:test";
import assert from "node:assert/strict";
import { checkin, withCheckin } from "../src/index.ts";

const URL_ = "https://spookyparticles.com/api/ping/tok_example";

type Call = { url: string; status: string | null; body: string };

function fakeFetch(answers: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = (async (input: URL | string, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push({ url: `${u.origin}${u.pathname}`, status: u.searchParams.get("status"), body: String(init?.body ?? "") });
    const next = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (next instanceof Error) throw next;
    return next.clone();
  }) as typeof fetch;
  return { fn, calls };
}

const okAnswer = () => Response.json({ ok: true, job: "nightly", status: "up" });
const cronReq = () => new Request("https://app.example.com/api/cron/nightly", { headers: { "user-agent": "vercel-cron/1.0" } });

test("sends ok by default and reports success", async () => {
  const f = fakeFetch([okAnswer()]);
  assert.equal(await checkin("ok", { url: URL_, fetch: f.fn }), true);
  assert.deepEqual(f.calls, [{ url: URL_, status: "ok", body: "" }]);
});

test("puts the note in the body, never the link, and caps it", async () => {
  const f = fakeFetch([okAnswer()]);
  await checkin("fail", { url: URL_, fetch: f.fn, note: "x".repeat(900) });
  assert.equal(f.calls[0]!.status, "fail");
  assert.equal(f.calls[0]!.body.length, 500);
});

test("never throws: no link, a bad link, or plain http all return false", async () => {
  const f = fakeFetch([okAnswer()]);
  assert.equal(await checkin("ok", { url: "", fetch: f.fn }), false);
  assert.equal(await checkin("ok", { url: "not a link", fetch: f.fn }), false);
  assert.equal(await checkin("ok", { url: "http://spookyparticles.com/api/ping/t", fetch: f.fn }), false);
  assert.equal(f.calls.length, 0);
});

test("retries a network error or a server error, then gives up quietly", async () => {
  const f = fakeFetch([new Error("down"), new Response("", { status: 502 }), okAnswer()]);
  assert.equal(await checkin("ok", { url: URL_, fetch: f.fn, retries: 2 }), true);
  assert.equal(f.calls.length, 3);
  const g = fakeFetch([new Error("down")]);
  assert.equal(await checkin("ok", { url: URL_, fetch: g.fn, retries: 1 }), false);
  assert.equal(g.calls.length, 2);
});

test("an unknown or paused link is not retried", async () => {
  const f = fakeFetch([Response.json({ ok: false, reason: "unknown" })]);
  assert.equal(await checkin("ok", { url: URL_, fetch: f.fn }), false);
  assert.equal(f.calls.length, 1);
});

test("a cron run that answers 2xx checks in ok and passes the answer through", async () => {
  const f = fakeFetch([okAnswer()]);
  const GET = withCheckin(async () => Response.json({ done: true }), { url: URL_, fetch: f.fn, start: true });
  const res = await GET(cronReq());
  assert.deepEqual(await res.json(), { done: true });
  assert.deepEqual(f.calls.map((c) => c.status), ["start", "ok"]);
});

test("a thrown error checks in fail with the error name only, then rethrows", async () => {
  const f = fakeFetch([okAnswer()]);
  const GET = withCheckin(async () => {
    throw new TypeError("password=hunter2 in a message");
  }, { url: URL_, fetch: f.fn });
  await assert.rejects(GET(cronReq()), TypeError);
  assert.deepEqual(f.calls, [{ url: URL_, status: "fail", body: "TypeError" }]);
});

test("a 4xx or 5xx answer checks in fail with the status code", async () => {
  const f = fakeFetch([okAnswer()]);
  const GET = withCheckin(async () => new Response("no", { status: 500 }), { url: URL_, fetch: f.fn });
  assert.equal((await GET(cronReq())).status, 500);
  assert.deepEqual(f.calls, [{ url: URL_, status: "fail", body: "HTTP 500" }]);
});

test("a visit that is not from Vercel's scheduler does not count, unless only is all", async () => {
  const f = fakeFetch([okAnswer()]);
  const browser = new Request("https://app.example.com/api/cron/nightly", { headers: { "user-agent": "Mozilla/5.0" } });
  await withCheckin(async () => new Response("ok"), { url: URL_, fetch: f.fn })(browser);
  assert.equal(f.calls.length, 0);
  await withCheckin(async () => new Response("ok"), { url: URL_, fetch: f.fn, only: "all" })(browser);
  assert.equal(f.calls.length, 1);
});

test("a check-in that cannot reach Spooky never breaks the job", async () => {
  const f = fakeFetch([new Error("down")]);
  const GET = withCheckin(async () => new Response("fine"), { url: URL_, fetch: f.fn, retries: 0 });
  assert.equal(await (await GET(cronReq())).text(), "fine");
});

test("keeps extra route arguments, like Next.js params", async () => {
  const f = fakeFetch([okAnswer()]);
  const GET = withCheckin(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => new Response((await ctx.params).id), { url: URL_, fetch: f.fn });
  assert.equal(await (await GET(cronReq(), { params: Promise.resolve({ id: "abc" }) })).text(), "abc");
});
