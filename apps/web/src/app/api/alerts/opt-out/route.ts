/**
 * GET /api/alerts/opt-out?u=<user id>&k=deploy_failed&t=<token>: the link at the bottom of
 * every alert email. One click, no sign-in, turns that alert off for that account. The token
 * is signed with a key derived from the master key, so only the email's recipient has it.
 */
import { connection } from "next/server";
import { optOutTokenValid, setDeployFailedEnabled } from "@/lib/alerts/deploy-failed";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · spooky particles</title></head><body style="margin:0;padding:48px 24px;background:#0c0d0f;color:#e6e7e9;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif"><main style="max-width:52ch;margin:0 auto"><p style="margin:0 0 12px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;color:#9a9ca1">spooky particles</p><h1 style="margin:0 0 12px;font-size:24px;font-weight:600">${title}</h1><p style="margin:0;color:#c9cbd0">${body}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const k = url.searchParams.get("k") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (k !== "deploy_failed" || !u || !t || !optOutTokenValid(u, "deploy_failed", t)) {
    return page("That link is not valid.", "It may have been cut short by your mail app. Write to hello@spookyparticles.com and we will turn the emails off by hand.", 400);
  }
  await setDeployFailedEnabled(u, false, "link:opt-out");
  return page("Deploy failure emails are off.", "Nothing else changed. Failures still show on your Today page and in the API. To turn the emails back on, write to hello@spookyparticles.com.");
}
