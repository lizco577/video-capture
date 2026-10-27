import { config } from "../config";
import { type Capabilities, inAppBrowser, missingCapabilities, platformOf, type Platform } from "../core/environment";
import { simEnabled, simCameraStream } from "../dev/sim";

export interface Environment {
  platform: Platform;
  inApp: string | null;
  missing: (keyof Capabilities)[];
}

export function detectEnvironment(): Environment {
  const ua = navigator.userAgent;
  const platform = platformOf(ua, navigator.maxTouchPoints);
  const caps: Capabilities = {
    secureContext: window.isSecureContext,
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    mediaRecorder: typeof MediaRecorder !== "undefined",
    deviceOrientation: typeof DeviceOrientationEvent !== "undefined",
    indexedDB: typeof indexedDB !== "undefined",
  };
  return { platform, inApp: simEnabled() ? null : inAppBrowser(ua, platform), missing: missingCapabilities(caps) };
}

export type MotionPermission = "granted" | "denied" | "not-required" | "error";

type PermissionRequester = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iOS 13+ needs an explicit permission request for motion sensors, and it must be
 * started synchronously inside a user tap. Android and desktop don't need one.
 */
function requestMotion(): Promise<MotionPermission> {
  const orientation = (window.DeviceOrientationEvent as unknown as PermissionRequester | undefined)?.requestPermission;
  const motion = (window.DeviceMotionEvent as unknown as PermissionRequester | undefined)?.requestPermission;
  if (!orientation && !motion) return Promise.resolve("not-required");
  // Start both requests before any await so they share the tap's user activation.
  const requests = [
    orientation?.call(window.DeviceOrientationEvent),
    motion?.call(window.DeviceMotionEvent),
  ].filter(Boolean) as Promise<"granted" | "denied">[];
  return Promise.all(requests).then(
    (results) => (results.every((r) => r === "granted") ? "granted" : "denied"),
    () => "error",
  );
}

export function requestCamera(): Promise<MediaStream> {
  if (simEnabled()) return Promise.resolve(simCameraStream());
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: config.camera.idealWidth },
      height: { ideal: config.camera.idealHeight },
    },
    audio: false,
  });
}

export interface PermissionResult {
  camera: "granted" | "denied" | "error";
  motion: MotionPermission;
  stream: MediaStream | null;
  error: string | null;
}

/** Call directly from the tap handler, before any other await. */
export async function requestAllPermissions(): Promise<PermissionResult> {
  const motionP = simEnabled() ? Promise.resolve<MotionPermission>("granted") : requestMotion();
  const cameraP = requestCamera();
  const [motion, camera] = await Promise.all([motionP, cameraP.then((s) => ({ s, e: null }), (e: unknown) => ({ s: null, e }))]);
  let cameraState: PermissionResult["camera"] = "granted";
  let error: string | null = null;
  if (!camera.s) {
    const name = (camera.e as DOMException | undefined)?.name ?? "Error";
    cameraState = name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error";
    error = `${name}: ${(camera.e as Error | undefined)?.message ?? ""}`;
  }
  return { camera: cameraState, motion, stream: camera.s, error };
}
