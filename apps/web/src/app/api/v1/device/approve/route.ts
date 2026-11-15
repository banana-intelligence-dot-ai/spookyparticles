/** Agent sign-in, step 2: an approver reads who is asking and approves or denies. */
import { deviceHandlers } from "@/lib/device-auth-db";
import { api } from "@/lib/http";

export const GET = api((req) => deviceHandlers.lookup(req));
export const POST = api((req) => deviceHandlers.approve(req));
