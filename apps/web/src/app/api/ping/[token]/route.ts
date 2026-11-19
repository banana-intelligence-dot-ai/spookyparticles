/** The check-in link. Behavior and the healthchecks-style endings: src/lib/ping-handler.ts. */
import { handlePing } from "@/lib/ping-handler";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handlePing(req, (await ctx.params).token);
}
export async function POST(req: Request, ctx: Ctx) {
  return handlePing(req, (await ctx.params).token);
}
