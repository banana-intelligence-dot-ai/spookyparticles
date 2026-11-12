export type RuleOp = "eq" | "gte" | "lte" | "gt" | "lt" | "exists";
export type ProbeRule = { path: string; op: RuleOp; value?: string | number | boolean };
export type Probe = { url: string; expect: ProbeRule[] };
export type JobSettingsRule = { path: string; op: RuleOp; value: string };

export type JobSettingsValue = {
  owner: string;
  maxRunMinutes: string;
  minCount: string;
  schedule: string;
  timeZone: string;
  probeUrl: string;
  rules: JobSettingsRule[];
};

export type StoredJobSettings = {
  owner: string | null;
  maxRunMinutes: number | null;
  minCount: number | null;
  schedule: string | null;
  timeZone: string | null;
  probe: Probe | null;
};

export type JobSettingsPatch = Partial<{
  owner: string | null;
  maxRunMinutes: number | null;
  minCount: number | null;
  schedule: string | null;
  timeZone: string | null;
  probe: Probe | null;
}>;

export function emptyJobSettings(timeZone = ""): JobSettingsValue {
  return {
    owner: "",
    maxRunMinutes: "",
    minCount: "",
    schedule: "",
    timeZone,
    probeUrl: "",
    rules: [{ path: "", op: "eq", value: "" }],
  };
}

export function settingsFromJob(job: StoredJobSettings): JobSettingsValue {
  return {
    owner: job.owner ?? "",
    maxRunMinutes: job.maxRunMinutes?.toString() ?? "",
    minCount: job.minCount?.toString() ?? "",
    schedule: job.schedule ?? "",
    timeZone: job.timeZone ?? "",
    probeUrl: job.probe?.url ?? "",
    rules: job.probe?.expect.map((rule) => ({ path: rule.path, op: rule.op, value: rule.value === undefined ? "" : String(rule.value) })) ?? [{ path: "", op: "eq", value: "" }],
  };
}

function ruleValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function probeFrom(value: JobSettingsValue): Probe | null {
  const url = value.probeUrl.trim();
  const rules = value.rules.filter((rule) => rule.path.trim()).map((rule) => ({
    path: rule.path.trim(),
    op: rule.op,
    ...(rule.op === "exists" ? {} : { value: ruleValue(rule.value) }),
  }));
  return url && rules.length ? { url, expect: rules } : null;
}

/** Extra fields for POST. Empty fields are omitted, including the browser's zone until a schedule is set. */
export function buildSettingsInput(value: JobSettingsValue): JobSettingsPatch {
  const input: JobSettingsPatch = {};
  if (value.owner.trim()) input.owner = value.owner.trim();
  if (value.maxRunMinutes !== "") input.maxRunMinutes = Number(value.maxRunMinutes);
  if (value.minCount !== "") input.minCount = Number(value.minCount);
  if (value.schedule.trim()) {
    input.schedule = value.schedule.trim();
    if (value.timeZone.trim()) input.timeZone = value.timeZone.trim();
  }
  // Sent even without a schedule, so the API's "schedule required" message reaches the person.
  const probe = probeFrom(value);
  if (probe) input.probe = probe;
  return input;
}

/** Settings-only PATCH. Unchanged fields are omitted and cleared fields become null. */
export function buildSettingsPatch(original: StoredJobSettings, value: JobSettingsValue, manual: boolean): JobSettingsPatch {
  const patch: JobSettingsPatch = {};
  const owner = value.owner.trim() || null;
  const maxRunMinutes = value.maxRunMinutes === "" ? null : Number(value.maxRunMinutes);
  const minCount = value.minCount === "" ? null : Number(value.minCount);
  if (owner !== original.owner) patch.owner = owner;
  if (maxRunMinutes !== original.maxRunMinutes) patch.maxRunMinutes = maxRunMinutes;
  if (minCount !== original.minCount) patch.minCount = minCount;
  if (!manual) return patch;

  const schedule = value.schedule.trim() || null;
  const timeZone = value.timeZone.trim() || null;
  const probe = probeFrom(value);
  if (schedule !== original.schedule) patch.schedule = schedule;
  if (timeZone !== original.timeZone) patch.timeZone = timeZone;
  if (JSON.stringify(probe) !== JSON.stringify(original.probe)) patch.probe = probe;
  return patch;
}

function shown(value: ProbeRule["value"]): string {
  return typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
}

export function describeProbeRule(rule: ProbeRule): string {
  if (rule.op === "exists") return `${rule.path} exists`;
  if (rule.op === "eq" && rule.value === "$today") return `${rule.path} is today`;
  const words: Record<Exclude<RuleOp, "exists">, string> = { eq: "is", gte: "at least", lte: "at most", gt: "more than", lt: "less than" };
  return `${rule.path} ${words[rule.op]} ${shown(rule.value)}`;
}
