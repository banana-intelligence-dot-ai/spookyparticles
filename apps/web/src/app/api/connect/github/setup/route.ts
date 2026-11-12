import { finishGithubSetup } from "@/lib/github-connect";

/** The GitHub App's Setup URL. GitHub redirects here after install or update. */
export const GET = (req: Request) => finishGithubSetup(req);
