/** Agent sign-in, step 3: no auth. The script polls with its deviceCode; once approved it gets its key, once. */
import { deviceHandlers } from "@/lib/device-auth-db";
import { api } from "@/lib/http";

export const POST = api((req) => deviceHandlers.token(req));
