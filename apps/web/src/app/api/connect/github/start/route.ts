import { beginGithubInstall } from "@/lib/github-connect";

/** Sends the signed-in user to GitHub's install screen for our GitHub App. */
export const GET = (req: Request) => beginGithubInstall(req);
