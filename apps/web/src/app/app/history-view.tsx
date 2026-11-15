"use client";
/**
 * History: the catch chart and every catch as a row, refreshed every 30 seconds. Reads the same
 * endpoints an agent does (catches with claims, check-ins, projects); the only writes are the
 * ones the open-break help already offered.
 */
import { useEffect, useState } from "react";
import { ErrorLine } from "@/components/ui";
import { useApi } from "@/components/use-api";
import type { Catches } from "@/lib/catches";
import type { Claim } from "@/lib/claims";
import { CatchLog } from "./catch-log";
import type { JobRow } from "./home-model";
import type { ProjectsReport } from "./project-model";

const REFRESH_MS = 30_000;

export function HistoryView() {
  const catches = useApi<Catches & { claims?: Claim[] }>("/api/v1/catches", { pollMs: () => REFRESH_MS });
  const checkins = useApi<{ jobs: JobRow[] }>("/api/v1/checkins", { pollMs: () => REFRESH_MS });
  const projects = useApi<ProjectsReport>("/api/v1/projects");
  // The clock is read in an effect, once per refresh: never Date.now() during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [catches.data]);

  if (catches.error) return <ErrorLine message={catches.error} />;
  if (!catches.data || now === null) return <p className="text-[16px] text-fg-2">Loading…</p>;
  return (
    <CatchLog
      data={catches.data}
      now={now}
      claims={catches.data.claims ?? []}
      jobs={checkins.data?.jobs ?? []}
      projects={projects.data?.projects ?? []}
      onChanged={() => {
        void catches.reload();
        void checkins.reload();
      }}
    />
  );
}
