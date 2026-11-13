"use client";
import Link from "next/link";
import { useState } from "react";
import { ConnectionsList } from "@/app/app/connections/connections-view";
import { ConnectedAgents, SignInWays, type AgentKey } from "@/app/app/connections/agents";
import { WiringMap } from "@/app/app/connections/wiring-map";
import type { Finding, Spend } from "@/app/app/data-model";
import { SpendScreen } from "@/app/app/findings/spend-view";
import { ActivityScreen } from "@/app/app/activity-view";
import type { ActivityReport, ProjectsReport } from "@/app/app/project-model";
import { ProjectsScreen } from "@/app/app/projects-view";
import { ProjectPageScreen } from "@/app/app/project-page-view";
import { PROJECT_PAGE } from "./project-page-fixture";
import { TodayScreen } from "@/app/app/today-view";
import { RailView } from "@/app/app/rail";
import { CheckScreen } from "@/app/app/check/check-view";
import { CHECK_CLEAR, CHECK_FULL, CHECK_NONE, CHECK_NOT_READY, SERVICES_SAMPLE } from "./check-fixtures";
import { PageHeader, buttonStyles } from "@/components/ui";
import { FIXTURES, NOW } from "./fixtures";
import { CATCHES, CATCHES_NONE } from "./catches-fixture";
import { RUNS } from "./runs-fixture";
import { RunHistoryChart } from "@/app/app/jobs/run-history";
import { VIEWS, type View } from "./views";
import { FINDINGS, SPEND } from "./spend-fixtures";
import {
  ACTIVITY_FULL,
  ACTIVITY_GITHUB_ONLY,
  ACTIVITY_NONE,
  PROJECTS_CALM,
  PROJECTS_FULL,
  PROJECTS_GITHUB_ONLY,
  PROJECTS_NONE,
} from "./project-fixtures";

const NO_PARAMS = new URLSearchParams();

/** One session listening, one broken project nobody hears. */
const LISTENING = {
  checkedAt: new Date(NOW).toISOString(),
  listeners: [
    { project: "n8peace/daystart", lastAskedAt: new Date(NOW - 4 * 60_000).toISOString(), agent: "macbook-read", open: 0 },
    { project: "n8peace/news-factory", lastAskedAt: new Date(NOW - 3 * 3_600_000).toISOString(), agent: "macbook-write", open: 1 },
  ],
  unheard: [{ project: "supportgrid", open: 1 }],
};

const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
/** Agents and sign-in identities for the busier fixtures. Ids are obviously fake. */
const AGENTS: AgentKey[] = [
  { id: "k1", name: "Claude Code on the laptop", prefix: "sp_7f3a", scopes: ["read"], createdAt: day(6), lastUsedAt: day(0.02), revokedAt: null },
  { id: "k2", name: "Cursor", prefix: "sp_b21c", scopes: ["read"], createdAt: day(20), lastUsedAt: null, revokedAt: null },
  { id: "k3", name: "Old CI job", prefix: "sp_09de", scopes: ["read"], createdAt: day(60), lastUsedAt: day(41), revokedAt: day(40) },
];
const IDENTITIES = [
  { provider: "github", accountId: "583231", since: day(30) },
  { provider: "google", accountId: "104857600000000000001", since: day(12) },
  { provider: "google", accountId: "104857600000000000002", since: day(3) },
];

/** What the API would return alongside each connections fixture. */
const DATA: Record<string, { spend: Spend | null; findings: Finding[]; projects: ProjectsReport; activity: ActivityReport }> = {
  empty: { spend: null, findings: [], projects: PROJECTS_NONE, activity: ACTIVITY_NONE },
  "github-only": { spend: null, findings: [], projects: PROJECTS_GITHUB_ONLY, activity: ACTIVITY_GITHUB_ONLY },
  syncing: { spend: null, findings: [], projects: PROJECTS_GITHUB_ONLY, activity: ACTIVITY_NONE },
  "full-scan": { spend: null, findings: [], projects: PROJECTS_FULL, activity: ACTIVITY_FULL },
  errored: { spend: SPEND, findings: FINDINGS, projects: PROJECTS_FULL, activity: ACTIVITY_FULL },
  done: { spend: SPEND, findings: FINDINGS, projects: PROJECTS_CALM, activity: ACTIVITY_FULL },
  "done-expired": { spend: SPEND, findings: FINDINGS, projects: PROJECTS_FULL, activity: ACTIVITY_FULL },
  many: { spend: SPEND, findings: FINDINGS, projects: PROJECTS_FULL, activity: ACTIVITY_FULL },
};

/** Receipts only arrive from connected inboxes, so the preview keeps spend to those. */
function spendFor(spend: Spend | null, inboxes: string[]): Spend | null {
  if (!spend) return null;
  const subscriptions = spend.subscriptions.filter((s) => inboxes.includes(s.inbox));
  const live = subscriptions.filter((s) => s.active && s.verified && s.monthlyCents !== null && s.currency === spend.currency);
  const sum = (scope: string) => live.filter((s) => s.scope === scope).reduce((a, s) => a + (s.monthlyCents ?? 0), 0);
  return {
    ...spend,
    subscriptions,
    monthlyCents: sum("work"),
    personalMonthlyCents: sum("personal"),
    unknownMonthlyCents: sum("unknown"),
    unverified: subscriptions.filter((s) => !s.verified).length,
  };
}

/** The preview's stand-in for the scope endpoint: the call lands, totals follow, as the server would. */
function withScopes(spend: Spend | null, scopes: Record<string, "work" | "personal">): Spend | null {
  if (!spend) return null;
  const subscriptions = spend.subscriptions.map((s) => (scopes[s.vendorKey] ? { ...s, scope: scopes[s.vendorKey] } : s));
  return spendFor({ ...spend, subscriptions }, [...new Set(subscriptions.map((s) => s.inbox))]);
}

const PATH: Record<View, string> = {
  today: "/app",
  projects: "/app/projects",
  activity: "/app/activity",
  schedules: "/app/jobs",
  spend: "/app/findings",
  connections: "/app/connections",
  project: "/app/projects",
  check: "/app/check",
};

/** Renders the real screens against fixtures; actions are inert. Light mode is opted in here. */
export function Preview({ only, view }: { only: string | null; view: View }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Finding["status"]>>({});
  const [scopes, setScopes] = useState<Record<string, "work" | "personal">>({});
  const f = FIXTURES.find((x) => x.key === only) ?? FIXTURES.find((x) => x.key === "many")!;
  const d = DATA[f.key];
  const inboxes = f.list.filter((c) => c.provider === "gmail" && c.status !== "revoked").map((c) => c.display);
  const spend = withScopes(spendFor(d.spend, inboxes), scopes);
  const findings = d.findings.map((x) => (marks[x.id] ? { ...x, status: marks[x.id] } : x));
  const noop = () => {};

  return (
    <div data-theme="system" className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <RailView pathname={PATH[view]} email="you@example.com" onSignOut={noop} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className={`mx-auto w-full max-w-6xl ${view === "projects" || view === "project" ? "" : view === "today" ? "[&>*:not(nav)]:max-w-5xl" : "[&>*:not(nav)]:max-w-4xl"}`}>
          <nav aria-label="Preview" className="mb-8 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12px] text-fg-3">
            <span>preview:</span>
            {FIXTURES.map((x) => (
              <Link key={x.key} href={`?state=${x.key}&view=${view}`} className={x.key === f.key ? "text-fg" : "hover:text-fg"}>
                {x.key}
              </Link>
            ))}
            <span aria-hidden>/</span>
            {VIEWS.map((v) => (
              <Link key={v} href={`?state=${f.key}&view=${v}`} className={v === view ? "text-fg" : "hover:text-fg"}>
                {v}
              </Link>
            ))}
          </nav>

          {view === "today" ? (
            <TodayScreen ready connections={f.list} projects={d.projects} findings={findings} spend={spend} activity={d.activity} jobs={[]} listening={f.key === "done-expired" ? { checkedAt: new Date(NOW).toISOString(), listeners: [], unheard: [] } : LISTENING} catches={f.key === "done-expired" ? CATCHES_NONE : CATCHES} params={NO_PARAMS} error={null} now={NOW} />
          ) : null}

          {view === "projects" ? (
            <ProjectsScreen ready connections={f.list} report={d.projects} error={null} now={NOW} />
          ) : null}

          {view === "project" ? <ProjectPageScreen ready name={PROJECT_PAGE.project.name} page={PROJECT_PAGE} error={null} now={NOW} /> : null}

          {view === "activity" ? (
            <ActivityScreen ready connections={f.list} report={d.activity} error={null} now={NOW} limit={100} onMore={null} />
          ) : null}


          {view === "schedules" ? (
            <>
              <PageHeader title="Schedules" lede="Your scheduled jobs, like crons and nightly builds, and whether each ran on time. When one misses, you hear by phone, Slack, Teams or email, and again when it's back." />
              <RunHistoryChart data={RUNS} now={NOW} />
            </>
          ) : null}

          {view === "spend" ? (
            <SpendScreen
              connections={f.list}
              spend={spend}
              findings={findings}
              notices={d.activity.items}
              vendors={f.mail}
              now={NOW}
              error={null}
              onMark={async (id, status) => {
                setMarks((m) => ({ ...m, [id]: status }));
                return null;
              }}
              onScope={async (vendorKey, scope) => {
                setScopes((m) => ({ ...m, [vendorKey]: scope }));
                return null;
              }}
            />
          ) : null}

          {/* many: findings open. done: all clear. empty: no Vercel yet. Any other state: before the table exists. */}
          {view === "check" ? (
            <CheckScreen report={f.key === "many" ? CHECK_FULL : f.key === "done" ? CHECK_CLEAR : f.list.length ? CHECK_NOT_READY : CHECK_NONE} error={null} now={NOW} services={f.key === "many" ? SERVICES_SAMPLE : null} onDismiss={noop} onRestore={noop} />
          ) : null}

          {view === "connections" ? (
            <>
              <PageHeader
                title="Connections"
                lede="Read-only access you grant, one provider at a time. Revoke any of it here; nothing is ever deleted on your accounts."
              />
              <WiringMap connections={f.list} keys={f.key === "many" || f.key === "done" ? AGENTS : []} now={NOW} />
              <ConnectionsList
                list={f.list}
                now={NOW}
                busy={null}
                confirming={confirming}
                onConfirm={setConfirming}
                onRevoke={noop}
                onSync={noop}
                actions={{
                  github: (
                    <>
                      <button type="button" className={buttonStyles.ghost}>Add GitHub account</button>
                      <button type="button" className={f.list.some((c) => c.provider === "github") ? buttonStyles.secondary : buttonStyles.primary}>Install on GitHub</button>
                    </>
                  ),
                  gmail: (
                    <button type="button" className={f.list.some((c) => c.provider === "github") && !f.list.some((c) => c.provider === "gmail") ? buttonStyles.primary : buttonStyles.secondary}>
                      {f.list.some((c) => c.provider === "gmail") ? "Add another inbox" : "Add Gmail inbox"}
                    </button>
                  ),
                  vercel: (
                    <button type="button" className={f.list.some((c) => c.provider === "gmail") && !f.list.some((c) => c.provider === "vercel") ? buttonStyles.primary : buttonStyles.secondary}>
                      Add Vercel token
                    </button>
                  ),
                }}
              />
              {f.list.length ? (
                <>
                  <ConnectedAgents
                    keys={f.key === "many" || f.key === "done" ? AGENTS : []}
                    now={NOW}
                    primary={f.list.some((c) => c.provider === "gmail")}
                    onCreate={async (name) => ({ id: "k9", name, prefix: "sp_e4f1", scopes: ["read"], key: "sp_e4f1example0000000000000000000000000000" })}
                    onRevoke={async () => null}
                  />
                  <SignInWays identities={IDENTITIES.slice(0, f.key === "many" ? 3 : 1)} now={NOW} />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
