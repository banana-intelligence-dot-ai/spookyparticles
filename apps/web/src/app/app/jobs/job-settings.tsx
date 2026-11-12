import { buttonStyles } from "@/components/ui";
import type { JobSettingsRule, JobSettingsValue, RuleOp } from "./job-settings-lib";

export const INPUT = "h-11 rounded-lg border border-line-2 bg-transparent px-3 text-[14px] text-fg hover:border-line-3 focus:border-line-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9";

const ZONES = ["UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];
const OPS: [RuleOp, string][] = [["eq", "is"], ["gte", "at least"], ["lte", "at most"], ["gt", "more than"], ["lt", "less than"], ["exists", "has a value"]];

export function JobSettingsFields({ value, onChange, manual, idPrefix }: { value: JobSettingsValue; onChange: (value: JobSettingsValue) => void; manual: boolean; idPrefix: string }) {
  const set = <K extends keyof JobSettingsValue>(key: K, next: JobSettingsValue[K]) => onChange({ ...value, [key]: next });
  const setRule = (index: number, patch: Partial<JobSettingsRule>) => set("rules", value.rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  const removeRule = (index: number) => set("rules", value.rules.filter((_, i) => i !== index));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-[14px] text-fg-2 sm:col-span-2">
        Owner
        <input value={value.owner} onChange={(e) => set("owner", e.target.value)} maxLength={80} placeholder="the agent or person who fixes it" className={INPUT} />
      </label>
      {manual ? (
        <>
          <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
            Exact schedule
            <input value={value.schedule} onChange={(e) => set("schedule", e.target.value)} maxLength={100} placeholder="35 7 * * 1-5" className={`${INPUT} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
            Time zone
            <input value={value.timeZone} onChange={(e) => set("timeZone", e.target.value)} list={`${idPrefix}-zones`} maxLength={80} placeholder="America/New_York" className={INPUT} />
            <datalist id={`${idPrefix}-zones`}>{ZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
          </label>
        </>
      ) : null}
      <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
        Longest run in minutes
        <input type="number" min={1} max={10080} value={value.maxRunMinutes} onChange={(e) => set("maxRunMinutes", e.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
        Fewest items per run
        <input type="number" min={0} max={1_000_000_000} value={value.minCount} onChange={(e) => set("minCount", e.target.value)} className={INPUT} />
      </label>
      {manual ? (
        <fieldset className="border-t border-line-1 pt-4 sm:col-span-2">
          <legend className="pr-3 text-[14px] font-medium text-fg">Check the result</legend>
          <label className="mt-1 flex flex-col gap-1.5 text-[14px] text-fg-2">
            URL
            <input type="url" pattern="https://.*" value={value.probeUrl} onChange={(e) => set("probeUrl", e.target.value)} maxLength={2048} placeholder="https://example.com/api/outcome" className={`${INPUT} font-mono`} />
          </label>
          <div className="mt-3 space-y-3">
            {value.rules.map((rule, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto] sm:items-end">
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
                  Path
                  <input value={rule.path} onChange={(e) => setRule(index, { path: e.target.value })} maxLength={160} placeholder="sentCount" className={`${INPUT} min-w-0 font-mono`} />
                </label>
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
                  Rule
                  <select value={rule.op} onChange={(e) => setRule(index, { op: e.target.value as RuleOp })} className={INPUT}>
                    {OPS.map(([op, label]) => <option key={op} value={op}>{label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-[14px] text-fg-2">
                  Value
                  <input value={rule.value} onChange={(e) => setRule(index, { value: e.target.value })} maxLength={160} placeholder={rule.op === "eq" ? "$today or a value" : "1"} disabled={rule.op === "exists"} className={`${INPUT} min-w-0 font-mono`} />
                </label>
                <button type="button" className={buttonStyles.ghost} onClick={() => removeRule(index)} disabled={value.rules.length === 1}>Remove</button>
              </div>
            ))}
          </div>
          {value.rules.length < 5 ? <button type="button" className={`${buttonStyles.ghost} mt-3`} onClick={() => set("rules", [...value.rules, { path: "", op: "eq", value: "" }])}>Add rule</button> : null}
        </fieldset>
      ) : null}
    </div>
  );
}
