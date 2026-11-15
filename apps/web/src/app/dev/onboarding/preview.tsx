"use client";
import Link from "next/link";
import { useState } from "react";
import { AgentsScreen } from "@/app/app/agents/agents-view";
import { CatchLog } from "@/app/app/catch-log";
import { Channels, type Channel } from "@/app/app/settings/channels";
import { NowScreen, type NowActions } from "@/app/app/now-view";
import { ProjectsList } from "@/app/app/projects-list";
import { PublicFeedSwitch } from "@/app/app/public-feed-toggle";
import { ConnectionsList, MAIN, MorePages, YourData } from "@/app/app/settings/settings-view";
import { SignInWays } from "@/app/app/settings/sign-in-ways";
import { StoppedList } from "@/app/app/settings/stopped";
import { ProjectScreen } from "@/app/app/project-view";
import { HOME_CATCHES, HOME_JOBS, HOME_NONE, HOME_RUNS } from "./home-fixture";
import type { Finding, Spend } from "@/app/app/data-model";
import { SpendScreen } from "@/app/app/findings/spend-view";
import { ActivityScreen } from "@/app/app/activity-view";
import type { ActivityReport, ProjectsReport } from "@/app/app/project-model";
import { ProjectPageScreen } from "@/app/app/project-page-view";
import { PROJECT_PAGE } from "./project-page-fixture";
import { RailView } from "@/app/app/rail";
import { CheckScreen } from "@/app/app/check/check-view";
import { CHECK_CLEAR, CHECK_FULL, CHECK_NONE, CHECK_NOT_READY } from "./check-fixtures";
import { PageHeader, SectionTitle, buttonStyles } from "@/components/ui";
import type { NowFixture } from "./now-fixture";
import { FIXTURES, NOW } from "./fixtures";
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

const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const CHANNELS: Channel[] = [
  { id: "c1", kind: "ntfy", label: "My phone", project: null, enabled: true, lastOkAt: day(0.2), lastError: null },
  { id: "c2", kind: "slack", label: "#ops", project: "octocat/ledger-api", enabled: true, lastOkAt: day(3), lastError: null },
];
const OK = async () => null;
const NOW_ACTIONS: NowActions = { clear: OK, restore: OK, stop: OK, resume: OK };
const IDENTITIES = [
  { provider: "github", accountId: "583231", since: day(30) },
  { provider: "google", accountId: "104857600000000000001", since: day(12) },
  { provider: "google", accountId: "104857600000000000002", since: day(3) },
];

/** What the API would return alongside each connections fixture. */
const DATA: Record<string, { spend: Spend | null; findings: Finding[]; projects: ProjectsReport; activity: ActivityReport }> = {
  watching: { spend: null, findings: [], projects: PROJECTS_FULL, activity: ACTIVITY_FULL },
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
  now: "/app",
  history: "/app/history",
  projects: "/app/projects",
  project: "/app/projects",
  agents: "/app/agents",
  settings: "/app/settings",
  details: "/app/projects/x/y/details",
  activity: "/app/activity",
  schedules: "/app/jobs",
  spend: "/app/findings",
  check: "/app/check",
};
const WIDE: View[] = ["details"];
const MEDIUM: View[] = ["now", "history", "project", "projects", "agents", "settings"];

/** Renders the real screens against fixtures; actions are inert. Light mode is opted in here. */
export function Preview({ only, view, fixture }: { only: string | null; view: View; fixture: NowFixture }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [feedOn, setFeedOn] = useState(true);
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
      <RailView pathname={PATH[view]} email="you@example.com" onYou={fixture.open.summary.onYou} onSignOut={noop} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className={`mx-auto w-full max-w-6xl ${WIDE.includes(view) ? "" : MEDIUM.includes(view) ? "[&>*:not([aria-label=Preview])]:max-w-5xl" : "[&>*:not([aria-label=Preview])]:max-w-4xl"}`}>
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

          {view === "now" ? <NowScreen ready report={fixture.open} connections={f.list} params={NO_PARAMS} error={null} now={NOW} actions={NOW_ACTIONS} /> : null}

          {view === "history" ? <CatchLog data={fixture.history} now={NOW} claims={fixture.history.claims ?? []} jobs={HOME_JOBS} projects={d.projects.projects} /> : null}

          {view === "projects" ? (
            <ProjectsList ready connections={f.list} projects={d.projects} catches={f.key === "done" ? HOME_NONE : HOME_CATCHES} jobs={HOME_JOBS} error={null} now={NOW} />
          ) : null}

          {view === "agents" ? (
            <AgentsScreen
              report={fixture.agents}
              now={NOW}
              onCreate={async (name, access) => ({ id: "k9", name, prefix: "sp_e4f1", scopes: access === "write" ? ["read", "write"] : ["read"], key: "sp_e4f1example0000000000000000000000000000" })}
              onRevoke={OK}
            />
          ) : null}

          {view === "project" ? (
            <ProjectScreen ready name="octocat/ledger-api" projects={d.projects} catches={HOME_CATCHES} jobs={HOME_JOBS} runs={HOME_RUNS} error={null} now={NOW} onWatch={async () => null} />
          ) : null}

          {view === "details" ? <ProjectPageScreen ready name={PROJECT_PAGE.project.name} page={PROJECT_PAGE} error={null} now={NOW} /> : null}

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
            <CheckScreen report={f.key === "many" ? CHECK_FULL : f.key === "done" ? CHECK_CLEAR : f.list.length ? CHECK_NOT_READY : CHECK_NONE} error={null} now={NOW} onDismiss={noop} onRestore={noop} />
          ) : null}

          {view === "settings" ? (
            <>
              <PageHeader
                title="Settings"
                lede="What Spooky reads, where alerts go, and what you stopped watching. Read only toward your accounts; nothing is ever deleted on them."
              />
              <ConnectionsList
                list={f.list}
                providers={MAIN}
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
                  <div className="mt-14">
                    <Channels list={CHANNELS} loading={false} onChanged={noop} onNotice={noop} />
                  </div>
                  <StoppedList mutes={fixture.mutes} cleared={fixture.cleared} projects={fixture.projects} now={NOW} onStop={OK} onResume={OK} onRestore={OK} />
                  <section aria-labelledby="feed-title" className="mt-14">
                    <SectionTitle id="feed-title">Homepage feed</SectionTitle>
                    <PublicFeedSwitch on={feedOn} busy={false} error={null} onFlip={() => setFeedOn((v) => !v)} />
                  </section>
                  <SignInWays identities={IDENTITIES.slice(0, f.key === "many" ? 3 : 1)} now={NOW} />
                  <YourData />
                  <MorePages />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
