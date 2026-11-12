import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { layoutSky } from "@/components/constellation/layout";
import { sampleSky } from "@/components/constellation/sample";

export const alt = "spooky particles: know when a Vercel app breaks.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SAMPLE_NOW = Date.parse("2026-11-01T12:00:00Z");

/** Geist ships in the workspace's hoisted node_modules; look in both places. */
async function font(dir: string, file: string) {
  const rel = join("node_modules/geist/dist/fonts", dir, file);
  const path = [join(process.cwd(), rel), join(process.cwd(), "../..", rel)].find((p) => existsSync(p));
  return path ? readFile(path) : null;
}

export default async function OpengraphImage() {
  const [mono, sans] = await Promise.all([font("geist-mono", "GeistMono-Medium.ttf"), font("geist-sans", "Geist-Regular.ttf")]);
  const sample = sampleSky(SAMPLE_NOW);
  const sky = layoutSky({ ...sample, width: 600, now: SAMPLE_NOW });
  const scale = Math.min(500 / sky.width, 486 / sky.height);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0d0f", color: "#f2f2ef", padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 28 }}>spooky particles</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Geist Mono", fontSize: 48, lineHeight: 1.12, letterSpacing: -1.2 }}>
              Vercel runs your apps. Know when one breaks.
            </div>
            <div style={{ fontFamily: "Geist", fontSize: 22, color: "#9b9da3", marginTop: 28 }}>
              Missed schedules. Failed deploys. Read-only alerts.
            </div>
          </div>
          <div style={{ fontFamily: "Geist", fontSize: 20, color: "#80848b" }}>A Banana Intelligence product</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <svg width={sky.width * scale} height={sky.height * scale} viewBox={`0 0 ${sky.width} ${sky.height}`}>
            {sky.clusters.flatMap((c) =>
              c.rings.map((r, i) => (
                <circle key={`${c.id}-${i}`} cx={c.cx} cy={c.cy} r={r} fill="none" stroke="#f2f2ef" strokeOpacity="0.12" strokeDasharray="2 4" />
              )),
            )}
            {sky.links
              .filter((l) => l.cross)
              .map((l, i) => (
                <path key={i} d={l.d} fill="none" stroke="#f2f2ef" strokeOpacity="0.35" />
              ))}
            {sky.stars.map((s) =>
              s.hub ? (
                <circle key={s.id} cx={s.x} cy={s.y} r={s.r + 1.5} fill="#0c0d0f" stroke="#f2f2ef" strokeWidth="1.25" />
              ) : (
                <circle
                  key={s.id}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill={(s.monthlyCents ?? 0) > 0 ? "#6fcf8e" : s.status === "failure" ? "#e06c5f" : "#f2f2ef"}
                  fillOpacity={(s.monthlyCents ?? 0) > 0 ? 1 : s.brightness}
                />
              ),
            )}
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(mono ? [{ name: "Geist Mono", data: mono, weight: 500 as const, style: "normal" as const }] : []),
        ...(sans ? [{ name: "Geist", data: sans, weight: 400 as const, style: "normal" as const }] : []),
      ],
    },
  );
}
