/**
 * The "Retire it here" link in quiet-job alerts. The token binds one user to one job and is
 * signed with its own key derived from the master key, so it can't be reused for another job,
 * another account, or the opt-out link.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseMasterKey } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

function retireSecret(env: Record<string, string | undefined> = process.env): Buffer {
  return createHmac("sha256", parseMasterKey(env.SP_MASTER_KEY)).update("alerts:retire-job").digest();
}

export function retireToken(userId: string, jobId: string, env?: Record<string, string | undefined>): string {
  return createHmac("sha256", retireSecret(env)).update(`${userId}:${jobId}`).digest("base64url");
}

export function retireTokenValid(userId: string, jobId: string, token: string, env?: Record<string, string | undefined>): boolean {
  const expected = Buffer.from(retireToken(userId, jobId, env));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Opens a confirm page. Retiring needs the button press (a POST), so mail scanners that open links can't retire a job. */
export function retireUrl(userId: string, jobId: string): string {
  const u = new URL("/api/alerts/retire-job", appUrl());
  u.searchParams.set("u", userId);
  u.searchParams.set("j", jobId);
  u.searchParams.set("t", retireToken(userId, jobId));
  return u.toString();
}
