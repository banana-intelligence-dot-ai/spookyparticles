import { beginConnect } from "@/lib/connect";
import { googleAuthorizeUrl } from "@/lib/providers/google";

export const GET = (req: Request) => beginConnect(req, "gmail", googleAuthorizeUrl);
