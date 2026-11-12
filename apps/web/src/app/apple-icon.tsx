import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the favicon's orbit mark: a hub, one dashed ring, one green point, on the brand near-black. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0d0f" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="10" fill="none" stroke="#f2f2ef" strokeOpacity="0.45" strokeWidth="0.9" strokeDasharray="1.4 2.2" />
          <circle cx="16" cy="16" r="3.6" fill="none" stroke="#f2f2ef" strokeWidth="1.2" />
          <circle cx="16" cy="16" r="1.1" fill="#f2f2ef" />
          <circle cx="7.3" cy="21" r="2.3" fill="#6fcf8e" />
        </svg>
      </div>
    ),
    size,
  );
}
