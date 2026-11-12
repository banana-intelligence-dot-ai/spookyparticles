/** Small helpers so every /api/v1 route answers errors the same way. */
import { connection } from "next/server";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function api<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    // Always request time: never prerender an API response at build.
    await connection();
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      // Log the message only. Never log request bodies, headers or tokens.
      console.error("[api] unhandled", req.method, new URL(req.url).pathname, (err as Error)?.message);
      return json({ error: { code: "internal", message: "Internal error" } }, { status: 500 });
    }
  };
}
