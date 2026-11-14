/** Agent sign-in, step 2: a signed-in browser reads who is asking (GET) and approves or denies (POST). */
import { deviceHandlers } from "@/lib/device-auth-db";
import { api } from "@/lib/http";

export const GET = api((req) => deviceHandlers.lookup(req));
export const POST = api((req) => deviceHandlers.approve(req));
