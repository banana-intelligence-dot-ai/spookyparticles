import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for the app shell: no session cookie, back to the landing page.
 * Real authorization happens in every /api/v1 route via requireActor().
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/?signin=required", request.url));
  }
  return NextResponse.next();
}

// Only the app shell. API routes and Workflow's /.well-known/workflow/ paths are never matched.
export const config = { matcher: ["/app", "/app/:path*"] };
