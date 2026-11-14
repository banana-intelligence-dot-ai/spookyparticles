import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { linkReturnTo } from "@/lib/sign-in-notice";

/**
 * Optimistic gate for the app shell and the agent approve page: no session cookie, back to the
 * landing page. /link comes back to itself, code and all, after sign-in.
 * Real authorization happens in every /api/v1 route via requireActor().
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const to = new URL("/?signin=required", request.url);
    if (request.nextUrl.pathname === "/link") {
      to.searchParams.set("returnTo", linkReturnTo(request.nextUrl.searchParams.get("code")));
    }
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

// Only the app shell and /link. API routes and Workflow's /.well-known/workflow/ paths are never matched.
export const config = { matcher: ["/app", "/app/:path*", "/link"] };
