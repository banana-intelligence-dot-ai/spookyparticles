import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { INCIDENT } from "./_landing/incident";

export const alt = "spooky particles: know when it breaks, keep your agents going.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card is the homepage hero at rest: the entangled pair, your app and your agent, at
 * the two edges, both green after the real Nov 9 fix, with the headline between them.
 */
const W = 1200;
const H = 630;
const R = 228;
const CY = 272;
const LEFT = -40;
const RIGHT = W + 40;
const GREEN = "#62c98a";

/** Geist ships in the workspace's hoisted node_modules; look in both places. */
async function font(dir: string, file: string) {
  const rel = join("node_modules/geist/dist/fonts", dir, file);
  const path = [join(process.cwd(), rel), join(process.cwd(), "../..", rel)].find((p) => existsSync(p));
  return path ? readFile(path) : null;
}

/** One glass particle with the green light inside it, drawn the way the hero's CSS draws it. A plain call, not a component: Satori takes only intrinsic elements inside <svg>. */
function orb(cx: number) {
  return (
    <g key={cx}>
      <circle cx={cx} cy={CY} r={R * 1.5} fill="url(#halo)" />
      <circle cx={cx} cy={CY + R * 0.42} r={R * 0.9} fill="#000" opacity="0.7" filter="url(#soft)" />
      <circle cx={cx} cy={CY} r={R} fill="url(#glass)" />
      <circle cx={cx} cy={CY + R * 0.1} r={R * 0.82} fill="url(#light)" filter="url(#soft)" />
      <circle cx={cx} cy={CY} r={R} fill="url(#shade)" />
      <ellipse
        cx={cx - R * 0.24}
        cy={CY - R * 0.62}
        rx={R * 0.42}
        ry={R * 0.22}
        transform={`rotate(-30 ${cx - R * 0.24} ${CY - R * 0.62})`}
        fill="url(#spec)"
        filter="url(#soft)"
      />
      <circle cx={cx} cy={CY} r={R - 0.5} fill="none" stroke="#fff" strokeOpacity="0.1" />
    </g>
  );
}

export default async function OpengraphImage() {
  const [mono, sans] = await Promise.all([font("geist-mono", "GeistMono-Regular.ttf"), font("geist-sans", "Geist-Medium.ttf")]);
  const label = { fontFamily: "Geist Mono", fontSize: 19, lineHeight: 1.5, color: "#80848b" } as const;

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#0a0a0b", color: "#f2f2ef" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <radialGradient id="halo">
              <stop offset="0.55" stopColor={GREEN} stopOpacity="0.3" />
              <stop offset="1" stopColor={GREEN} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glass" cx="0.3" cy="0.2" r="1.15">
              <stop offset="0" stopColor="#30333a" />
              <stop offset="0.36" stopColor="#15161a" />
              <stop offset="0.76" stopColor="#060607" />
            </radialGradient>
            <radialGradient id="light" cx="0.5" cy="0.58" r="0.6">
              <stop offset="0" stopColor={GREEN} stopOpacity="0.95" />
              <stop offset="0.45" stopColor={GREEN} stopOpacity="0.65" />
              <stop offset="1" stopColor={GREEN} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="shade" cx="0.42" cy="0.36" r="0.7">
              <stop offset="0.78" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.5" />
            </radialGradient>
            <radialGradient id="spec">
              <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>
          {orb(LEFT)}
          {orb(RIGHT)}
        </svg>

        <div style={{ position: "absolute", top: 44, left: 0, right: 0, display: "flex", justifyContent: "center", fontFamily: "Geist Mono", fontSize: 24, color: "#f2f2ef" }}>
          spooky particles
        </div>

        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 30 }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 19, color: "#9b9da3" }}>“spooky action at a distance”</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 26, fontFamily: "Geist", fontSize: 64, lineHeight: 1.04, letterSpacing: -1.6 }}>
            <div>Fixed by the time</div>
            <div style={{ color: "#9b9da3" }}>you realize it’s broken.</div>
          </div>
          <div style={{ marginTop: 24, fontFamily: "Geist", fontSize: 24, color: "#9b9da3" }}>Entangle your coding agent with your app.</div>
        </div>

        <div style={{ position: "absolute", left: 48, bottom: 44, display: "flex", flexDirection: "column" }}>
          <div style={label}>your app</div>
          <div style={{ ...label, color: GREEN }}>{`working again ${INCIDENT.fixed.readyAt} UTC`}</div>
        </div>
        <div style={{ position: "absolute", right: 48, bottom: 44, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={label}>your agent</div>
          <div style={{ ...label, color: GREEN }}>{`pushed fix ${INCIDENT.fixed.commit}`}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(mono ? [{ name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const }] : []),
        ...(sans ? [{ name: "Geist", data: sans, weight: 500 as const, style: "normal" as const }] : []),
      ],
    },
  );
}
