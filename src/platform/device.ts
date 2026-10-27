import type { DeviceInfo } from "../core/session-log";

export function deviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio,
      orientationAngle: screenAngle(),
    },
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    standalone: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
  };
}

export function screenAngle(): number {
  const a = window.screen.orientation?.angle;
  if (typeof a === "number") return a;
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === "number" ? (legacy + 360) % 360 : 0;
}

export function newSessionId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keep the screen on during capture (iOS 16.4+, Android Chrome). */
export async function requestWakeLock(): Promise<{ release(): Promise<void> } | null> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
  if (!wl) return null;
  try {
    return await wl.request("screen");
  } catch {
    return null;
  }
}
