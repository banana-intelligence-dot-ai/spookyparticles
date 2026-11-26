import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  classifyPing,
  cleanMinutes,
  dueState,
  jobDisplayStatus,
  jobIssue,
  parseStatusFilter,
} from "../apps/web/src/lib/checkins";
import * as checkinsEval from "../apps/web/src/lib/checkins";
import { jobReachesSession } from "../apps/web/src/lib/incidents";
import { FIX_RULE, pagerWhat } from "../apps/web/src/lib/pager";
import { fixedAfterAlert, medianFixMinutes } from "../apps/web/src/lib/fix-stats";
import {
  historyChoice,
  mustWaitForCheckIn,
  scheduleConnectionId,
  scheduleSyncStatus,
} from "../apps/web/src/lib/vercel-watch";
import * as vercelWatchEval from "../apps/web/src/lib/vercel-watch";

type Case = {
  id: string;
  source: string;
  why: string;
  fn: string;
  input: Record<string, any>;
  expected: unknown;
};

// Input convention: ISO strings in fields ending in At become Dates. Fields ending in Ms stay numeric.
function reviveDates(value: any, key = ""): any {
  if (typeof value === "string" && key.endsWith("At")) return new Date(value);
  if (Array.isArray(value)) return value.map((item) => reviveDates(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, reviveDates(child, childKey)]));
  }
  return value;
}

const registry: Record<string, (input: Record<string, any>) => unknown> = {
  classifyPing: ({ kind, count, minCount, note }) => classifyPing(kind, count, minCount, note),
  cleanMinutes: ({ raw, fallback, max }) => cleanMinutes(raw, fallback, max),
  dueState: ({ dueAt, graceMinutes, nowAt }) => dueState(dueAt.getTime(), graceMinutes, nowAt.getTime()),
  fixedAfterAlert: ({ catch: c }) => fixedAfterAlert(c),
  medianFixMinutes: ({ fixed }) => medianFixMinutes(fixed),
  historyChoice: ({ currentId, connections, attempts }) => historyChoice(currentId, connections, attempts),
  noFixReason: ({ project, fixer, held }) => checkinsEval.noFixReason({ project, fixer, held }),
  jobIssue: ({ job }) => jobIssue(job),
  jobDisplayStatus: ({ job, nowAt }) => jobDisplayStatus(job, nowAt.getTime()),
  mustWaitForCheckIn: ({ job }) => mustWaitForCheckIn(job),
  pagerWhat: ({ what }) => pagerWhat(what),
  pagerWhatShape: ({ word, times }) => {
    const out = pagerWhat(String(word).repeat(times));
    return { fits: out.length <= 300, endsWithRule: out.endsWith(FIX_RULE) };
  },
  jobReachesSession: ({ project, narrowedTo }) => jobReachesSession(project, narrowedTo),
  parseStatusFilter: ({ raw }) => {
    const statuses = parseStatusFilter(raw);
    return statuses ? [...statuses].sort() : null;
  },
  scheduleConnectionId: ({ prior, activeIds, syncingId }) => scheduleConnectionId(prior, new Set(activeIds), syncingId),
  scheduleSyncStatus: ({ prior, shouldPause, restart }) => scheduleSyncStatus(prior, shouldPause, restart),
  shouldPauseMissingSchedule: ({ job, refs, schedulesKnown }) => vercelWatchEval.shouldPauseMissingSchedule(job, new Set(refs), schedulesKnown),
};

function display(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

const path = fileURLToPath(new URL("./cases.jsonl", import.meta.url));
const cases = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Case);
let passed = 0;

for (const testCase of cases) {
  const run = registry[testCase.fn];
  if (!run) {
    console.log(`FAIL ${testCase.id} expected ${display(testCase.expected)} got unknown fn ${testCase.fn}`);
    continue;
  }
  try {
    const actual = run(reviveDates(testCase.input));
    deepStrictEqual(actual, testCase.expected);
    passed++;
    console.log(`PASS ${testCase.id}`);
  } catch (error) {
    const actual = (() => {
      try { return run(reviveDates(testCase.input)); } catch (runError) { return String(runError); }
    })();
    console.log(`FAIL ${testCase.id} expected ${display(testCase.expected)} got ${display(actual)}`);
  }
}

console.log(`${passed}/${cases.length} passed`);
if (passed !== cases.length) process.exitCode = 1;
