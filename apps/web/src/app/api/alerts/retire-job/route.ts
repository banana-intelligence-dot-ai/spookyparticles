/**
 * The "Retire it here" link in quiet-job alerts, no sign-in.
 * GET /api/alerts/retire-job?u=<user id>&j=<job id>&t=<token> shows a confirm button.
 * POST (that button) retires the job. Mail scanners only open links, so they never retire anything.
 */
import { connection } from "next/server";
import { getJob, updateJob } from "@/lib/checkins";
import { retireTokenValid } from "@/lib/alerts/job-links";
import { escapeHtml, linkPage } from "@/lib/alerts/link-page";

const INVALID = () => linkPage("That link is not valid.", "<p style=\"margin:0\">It may have been cut short by your mail app. Retire the job from Jobs on spookyparticles.com, or write to hello@spookyparticles.com.</p>", 400);
const GONE = () => linkPage("That job is gone.", "<p style=\"margin:0\">It was deleted, so there is nothing to retire and no more alerts about it.</p>", 404);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function check(u: string, j: string, t: string) {
  if (!u || !j || !t || !retireTokenValid(u, j, t)) return { error: INVALID() };
  if (!UUID.test(j)) return { error: GONE() };
  const job = await getJob(u, j);
  if (!job) return { error: GONE() };
  return { job };
}

export async function GET(req: Request) {
  await connection();
  const p = new URL(req.url).searchParams;
  const [u, j, t] = [p.get("u") ?? "", p.get("j") ?? "", p.get("t") ?? ""];
  const r = await check(u, j, t);
  if (r.error) return r.error;
  const name = escapeHtml(r.job.name);
  if (r.job.status === "retired") return linkPage(`${name} is already retired.`, "<p style=\"margin:0\">No more alerts come for it. To bring it back, open Jobs on spookyparticles.com.</p>");
  const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`;
  return linkPage(
    `Retire ${name}?`,
    `<p style="margin:0 0 20px">Spooky stops watching it and stops alerting about it. Its history stays, and you can bring it back from Jobs any time.</p><form method="post" action="/api/alerts/retire-job">${hidden("u", u)}${hidden("j", j)}${hidden("t", t)}<button type="submit" style="min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#e6e7e9;color:#0c0d0f;font:600 15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;cursor:pointer">Retire ${name}</button></form>`,
  );
}

export async function POST(req: Request) {
  await connection();
  const form = await req.formData().catch(() => null);
  const get = (k: string) => (typeof form?.get(k) === "string" ? (form.get(k) as string) : "");
  const [u, j, t] = [get("u"), get("j"), get("t")];
  const r = await check(u, j, t);
  if (r.error) return r.error;
  const name = escapeHtml(r.job.name);
  if (r.job.status !== "retired") await updateJob(u, j, { retired: true }, "link:retire-job");
  return linkPage(`${name} is retired.`, "<p style=\"margin:0\">No more alerts come for it. Nothing else changed. To bring it back, open Jobs on spookyparticles.com.</p>");
}
