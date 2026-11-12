import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SAMPLE, SAMPLE_CAN_GO, SAMPLE_TOTAL, SiteFooter, money } from "../parts";

/**
 * Direction F, "The bill per app" (value-prop pick, 2026-11-03). One buyer, one job:
 * a solo builder with ten or more shipped apps across several logins wants the honest
 * monthly number per app, from the receipts, with the forgotten ones marked. The hero
 * names the buyer, the job and the free first action, then proves it with a per-app
 * table (not per vendor, which is what D showed and what every subscription tracker
 * already does). Dev only; nothing here ships.
 */

type AppLine = { project: string; host: string; cents: number; lastPush: string; flag?: string };

function perApp(): AppLine[] {
  const by = new Map<string, AppLine>();
  for (const l of SAMPLE) {
    if (l.project === "shared" || l.project.endsWith("domains")) continue;
    const cur = by.get(l.project) ?? { project: l.project, host: l.host, cents: 0, lastPush: l.lastPush };
    cur.cents += l.cents;
    if (l.canGo) cur.flag = l.note;
    by.set(l.project, cur);
  }
  return [...by.values()].sort((a, b) => (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || b.cents - a.cents);
}

export default function BillPerAppLanding() {
  const apps = perApp();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
      <Header motto="DevOps for vibe coders." />

      <main className="flex flex-1 flex-col pt-12 pb-24 sm:pt-20">
        <h1 className="max-w-[16ch] text-[44px] leading-[1.02] font-[540] tracking-[-0.025em] text-balance text-fg sm:text-[64px] xl:text-[88px] xl:leading-[0.98]">
          Every app you’ve shipped. What it spends. What can go.
        </h1>
        <p className="mt-6 max-w-[56ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:mt-8 sm:text-[20px] sm:leading-[1.5]">
          For anyone with ten side projects and three logins. Sign in with GitHub, add the inbox your bills land in. Ten
          minutes later: what you pay across every login, per app where a receipt names it, with the ones nobody has
          touched marked.
        </p>

        <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-5">
            <p className="text-[14px] font-medium text-fg">Start here. Free, read-only, nothing to install.</p>
            <div className="mt-3">
              <SignIn large />
            </div>
            <Promises className="mt-6" />
            <AgentSetup className="mt-10 border-t border-line-1 pt-8" />
          </div>

          <figure className="lg:col-span-7">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <span className="text-[14px] text-fg-3">A sample, read from 2 inboxes and 2 GitHub accounts</span>
              <span className="font-mono text-[14px] text-fg-2">
                {money(SAMPLE_TOTAL)}/mo in all · <span className="text-amber">{money(SAMPLE_CAN_GO)} can go</span>
              </span>
            </figcaption>
            <table className="mt-3 w-full border-collapse font-mono text-[13px] sm:text-[14px]">
              <thead>
                <tr className="border-b border-line-2 text-left text-fg-3">
                  <th scope="col" className="py-2 pr-3 font-normal">App</th>
                  <th scope="col" className="hidden py-2 pr-3 font-normal sm:table-cell">Host</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Per month</th>
                  <th scope="col" className="py-2 font-normal">Last push</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.project} className="border-b border-line-1 align-baseline">
                    <td className="py-2.5 pr-3 text-fg">
                      {a.project}
                      {a.flag ? <span className="block text-[12px] text-amber sm:inline sm:pl-3">{a.flag}</span> : null}
                    </td>
                    <td className="hidden py-2.5 pr-3 text-fg-2 sm:table-cell">{a.host}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-fg">{money(a.cents)}</td>
                    <td className={`py-2.5 tabular-nums ${a.flag ? "text-amber" : "text-fg-2"}`}>{a.lastPush} ago</td>
                  </tr>
                ))}
                <tr className="align-baseline text-fg-2">
                  <td className="py-2.5 pr-3">shared: OpenAI, Anthropic, 6 domains</td>
                  <td className="hidden py-2.5 pr-3 sm:table-cell" />
                  <td className="py-2.5 pr-3 text-right tabular-nums">{money(SAMPLE_TOTAL - apps.reduce((s, a) => s + a.cents, 0))}</td>
                  <td className="py-2.5">not per app</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-[14px] text-pretty text-fg-2">
              Every line opens the receipt it came from. No receipt, no number: it says unknown.
            </p>
          </figure>
        </div>
      </main>

      <SiteFooter />
      <DirectionTag letter="F" name="The bill per app" note="Value-prop pick, 2026-11-03" />
    </div>
  );
}
