/** Agent sign-in, step 1: no auth. Returns a secret deviceCode for the script and a userCode for the human. */
import { deviceHandlers } from "@/lib/device-auth-db";
import { api } from "@/lib/http";

export const POST = api((req) => deviceHandlers.start(req));
