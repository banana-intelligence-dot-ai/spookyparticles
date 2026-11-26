import type { SlimNode } from "@/lib/node-reads";
import type { VercelScope } from "@/lib/providers/vercel";
import { queryErrorRate, queryExternalApis } from "@/lib/providers/vercel-query";
import { EXTERNAL_APIS_REFUSED_AT, isFreshRefusal, OBSERVABILITY_REFUSED_AT, persistNodeRefusal } from "@/lib/vercel-refusals";

type ErrorRateResult = Awaited<ReturnType<typeof queryErrorRate>>;
type ExternalApiResult = Awaited<ReturnType<typeof queryExternalApis>>;

export type ProjectObservabilityRead =
  | { skipped: true }
  | { skipped: false; errorRate: ErrorRateResult; outside: ExternalApiResult | null };

/** Each project-scoped metric remembers its own refusal so one denied metric cannot hide another. */
export async function readProjectObservability(project: SlimNode, token: string, scope: VercelScope, projectId: string, sinceMs: number, untilMs: number): Promise<ProjectObservabilityRead> {
  const observabilityRefusal = project.attributes[OBSERVABILITY_REFUSED_AT];
  if (isFreshRefusal(observabilityRefusal, untilMs)) return { skipped: true };

  let errorRate: ErrorRateResult;
  try {
    errorRate = await queryErrorRate(token, scope, projectId, sinceMs, untilMs);
  } catch {
    errorRate = { ok: false, reason: "unavailable" };
  }
  if (!errorRate.ok) {
    if (errorRate.reason === "not_readable" && errorRate.status === 404) {
      await persistNodeRefusal(project.id, OBSERVABILITY_REFUSED_AT, { refused: true, read: false }, untilMs);
    }
    return { skipped: false, errorRate, outside: null };
  }
  if (typeof observabilityRefusal === "string") {
    await persistNodeRefusal(project.id, OBSERVABILITY_REFUSED_AT, { refused: false, read: true }, untilMs);
  }

  const externalApisRefusal = project.attributes[EXTERNAL_APIS_REFUSED_AT];
  if (isFreshRefusal(externalApisRefusal, untilMs)) return { skipped: false, errorRate, outside: null };
  let outside: ExternalApiResult;
  try {
    outside = await queryExternalApis(token, scope, projectId, sinceMs, untilMs);
  } catch {
    outside = { ok: false, reason: "unavailable" };
  }
  if (outside.ok) {
    if (typeof externalApisRefusal === "string") {
      await persistNodeRefusal(project.id, EXTERNAL_APIS_REFUSED_AT, { refused: false, read: true }, untilMs);
    }
  } else if (outside.reason === "not_readable" && outside.status === 404) {
    await persistNodeRefusal(project.id, EXTERNAL_APIS_REFUSED_AT, { refused: true, read: false }, untilMs);
  }
  return { skipped: false, errorRate, outside };
}
