import { EntangledWeb } from "../../../_landing/entangled-web";
import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SiteFooter } from "../parts";

/**
 * Direction G, "The ops team" (value-prop pick, revised to an ops and management focus). One buyer, one job: a solo builder with twenty shipped apps on
 * five hosts under three logins, and nobody running them. The hero names that person and the
 * job, the first action is one click to the map, and the proof is the production entangled
 * web. Spend appears only as a column on the map. Dev only; does not ship.
 */
export default function OpsTeamLanding() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
      <Header motto="VibeOps for vibe coders." />

      <main className="flex flex-1 flex-col pt-12 pb-24 sm:pt-20">
        <h1 className="max-w-[16ch] text-[44px] leading-[1.02] font-[540] tracking-[-0.025em] text-balance text-fg sm:text-[64px] xl:text-[88px] xl:leading-[0.98]">
          The ops team for every app you’ve shipped.
        </h1>
        <p className="mt-6 max-w-[58ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:mt-8 sm:text-[20px] sm:leading-[1.5]">
          You shipped 11 apps on 4 hosts under 3 logins. Nobody’s running them.
        </p>

        <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-6">
            <p className="text-[14px] font-medium text-fg">One click to your map. Read-only, nothing to install.</p>
            <div className="mt-3">
              <SignIn large />
            </div>
            <Promises className="mt-6" />
          </div>
          <AgentSetup className="border-t border-line-1 pt-8 lg:col-span-6 lg:border-t-0 lg:pt-0" />
        </div>

        <section aria-labelledby="map" className="mt-20 sm:mt-24">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h2 id="map" className="text-[20px] leading-[1.25] font-medium tracking-[-0.01em] text-fg sm:text-[24px]">
              Everything you run, wired together.
            </h2>
            <p className="max-w-[60ch] text-[14px] text-pretty text-fg-2 sm:text-[16px]">
              Touch an app: its host, domain, database, login and bill answer. Touch a host: every app on it.
            </p>
          </div>
          <EntangledWeb />
          <p className="mt-16 border-t border-line-1 pt-8 text-[16px] leading-[1.5] text-fg">
            VibeOps is running what you vibe coded.{" "}
            <a href="/vibeops" className="text-fg-2 underline decoration-line-2 underline-offset-4 hover:text-fg hover:decoration-fg">
              What the word means
            </a>
          </p>
        </section>
      </main>

      <SiteFooter />
      <DirectionTag letter="G" name="The ops team" note="Value-prop pick, revised 2026-11-03" />
    </div>
  );
}
