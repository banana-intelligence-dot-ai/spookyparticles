/**
 * GET /api/alerts/opt-out?u=<user id>&k=deploy_failed|daily_digest&t=<token>: the link at the
 * bottom of deploy failure emails and the daily digest. One click, no sign-in, turns that alert off for that account. The token
 * is signed with a key derived from the master key, so only the email's recipient has it.
 */
import { connection } from "next/server";
import { optOutTokenValid, setDeployFailedEnabled } from "@/lib/alerts/deploy-failed";
import { setDigestEnabled } from "@/lib/alerts/digest";
import { linkPage } from "@/lib/alerts/link-page";

const page = (title: string, body: string, status = 200) => linkPage(title, `<p style="margin:0">${body}</p>`, status);

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const k = url.searchParams.get("k") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if ((k !== "deploy_failed" && k !== "daily_digest") || !u || !t || !optOutTokenValid(u, k, t)) {
    return page("That link is not valid.", "It may have been cut short by your mail app. Write to hello@spookyparticles.com and we will turn them off by hand.", 400);
  }
  if (k === "daily_digest") {
    await setDigestEnabled(u, false, "link:opt-out");
    return page("The daily digest is off.", "Nothing else changed. Alerts about problems still reach you. To turn the digest back on, write to hello@spookyparticles.com.");
  }
  await setDeployFailedEnabled(u, false, "link:opt-out");
  return page("Deploy failure alerts are off.", "Nothing else changed. Failures still show on your Now page and in the API. To turn them back on, write to hello@spookyparticles.com.");
}
