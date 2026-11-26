/**
 * Our own visits stay out of every count (Nate, Nov 20).
 * Open any page once with ?notrack=1 and this browser is skipped from then on; ?notrack=0 undoes it.
 * The flag is Vercel's documented localStorage key, so Web Analytics and our /api/t counter both skip.
 * No cookie, no UI.
 */
const FLAG = "va-disable";
/** This page's answer from the URL, kept in memory so it holds even when storage is blocked. */
let fromUrl: boolean | null = null;

/** Reads ?notrack=1|0 once, stores or clears the flag, and strips the param from the address bar. Safe to call many times. */
export function applyNoTrackParam(): void {
  if (typeof window === "undefined") return;
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const v = url.searchParams.get("notrack");
  if (v === null) return;
  if (v === "1" || v === "0") fromUrl = v === "1";
  try {
    if (v === "1") window.localStorage.setItem(FLAG, "1");
    else if (v === "0") window.localStorage.removeItem(FLAG);
  } catch {
    /* storage blocked: nothing to remember */
  }
  url.searchParams.delete("notrack");
  try {
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* leave the address bar alone */
  }
}

/** True when this browser asked not to be counted. */
export function isNoTrack(): boolean {
  if (typeof window === "undefined") return false;
  applyNoTrackParam();
  if (fromUrl !== null) return fromUrl;
  try {
    return window.localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}
