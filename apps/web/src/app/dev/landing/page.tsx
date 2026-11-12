import { DirectionIndex } from "./parts";

export default function LandingDirections() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-fg">Five home pages</h1>
      <p className="mt-2 mb-8 text-[16px] text-fg-2">Dev only. Each is a full above-the-fold plus one proof section.</p>
      <DirectionIndex />
    </main>
  );
}
