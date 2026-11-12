import { SignIn } from "../../../sign-in";
import { AgentSetup, DirectionTag, Header, Promises, SiteFooter } from "../parts";
import { EntangledField } from "./entangled";

/**
 * Direction B, "Entangled". The whole page is one interaction: touch a project and everything
 * tied to it answers. The field is the hero and the page's one reactive light surface.
 */
export default function EntangledLanding() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
      <Header motto="DevOps for vibe coders." />

      <main className="flex flex-1 flex-col pt-10 pb-24 sm:pt-16">
        <h1 className="max-w-[22ch] text-[32px] leading-[1.1] font-medium tracking-[-0.025em] text-balance text-fg sm:text-[48px] sm:leading-[1.05]">
          Every app you’ve shipped, wired together.
        </h1>
        <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.6] text-pretty text-fg-2 sm:text-[20px] sm:leading-[1.5]">
          Each repo, its host, its domain, its database and the bill that pays for it, across every login. When one breaks or bills, you see everything it touches.
        </p>
        <div className="mt-8">
          <SignIn large />
        </div>

        <div className="mt-12">
          <EntangledField />
          <p className="mt-2 text-[14px] text-fg-3">
            A sample. Point at any line. Yours is wired from your own GitHub and inboxes.
          </p>
        </div>

        <div className="mt-24 grid gap-12 border-t border-line-1 pt-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="font-mono text-[20px] leading-[1.3] tracking-[-0.01em] text-fg">“Spooky action at a distance.”</p>
            <p className="mt-1 text-[14px] text-fg-2">Albert Einstein, in a letter to Max Born, 1947</p>
            <Promises className="mt-8" />
          </div>
          <AgentSetup />
        </div>
      </main>

      <SiteFooter />
      <DirectionTag letter="B" name="Entangled" />
    </div>
  );
}
