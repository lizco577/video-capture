import { DEG, wrap180 } from "./angles";

// Orientation maths for the rear camera.
//
// DeviceOrientation gives alpha/beta/gamma as intrinsic Z-X'-Y'' rotations from
// the earth frame (x east, y north, z up) to the device frame. The rear camera
// looks along the device's -Z axis, so we rotate (0, 0, -1) into the earth frame
// and read pitch and heading from that vector. This avoids the gimbal problems
// raw `beta` has when the phone is held upright, which is how it's held here.
//
// The camera axis is fixed to the hardware, so pitch and heading don't depend on
// how the screen is rotated. screen.orientation.angle only changes which way is
// "up" on screen, and guidance.ts uses it for that.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface EulerReading {
  alpha: number;
  beta: number;
  gamma: number;
}

/** Rear-camera direction in the earth frame (x east, y north, z up). */
export function cameraVector({ alpha, beta, gamma }: EulerReading): Vec3 {
  const cA = Math.cos(alpha * DEG);
  const sA = Math.sin(alpha * DEG);
  const cB = Math.cos(beta * DEG);
  const sB = Math.sin(beta * DEG);
  const cG = Math.cos(gamma * DEG);
  const sG = Math.sin(gamma * DEG);
  // Negated third column of R = Rz(alpha) · Rx(beta) · Ry(gamma).
  return {
    x: -(cG * sA * sB + cA * sG),
    y: -(sA * sG - cA * cG * sB),
    z: -(cB * cG),
  };
}

/** Pitch of a direction: +90 straight up, 0 level, -90 straight down. */
export function pitchOf(v: Vec3): number {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return Math.asin(Math.max(-1, Math.min(1, v.z / len))) / DEG;
}

/** Heading of a direction, clockwise from the frame's y axis, in (-180, 180]. */
export function headingOf(v: Vec3): number {
  return wrap180(Math.atan2(v.x, v.y) / DEG);
}

/** Inverse of cameraVector for gamma = 0: the Euler angles that point the camera at (pitch, heading). */
export function eulerFor(pitchDeg: number, headingDeg: number): EulerReading {
  return { alpha: wrap180(-headingDeg), beta: 90 + pitchDeg, gamma: 0 };
}

/** Rate-independent exponential low-pass on a direction vector (no wrap-around glitches). */
export function smoothVector(prev: Vec3 | null, next: Vec3, dtMs: number, tauMs: number): Vec3 {
  if (!prev || dtMs <= 0 || tauMs <= 0) return normalise(next);
  const k = 1 - Math.exp(-dtMs / tauMs);
  return normalise({
    x: prev.x + (next.x - prev.x) * k,
    y: prev.y + (next.y - prev.y) * k,
    z: prev.z + (next.z - prev.z) * k,
  });
}

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export interface OrientationState {
  vector: Vec3 | null;
  lastT: number | null;
  pitch: number;
  /** Raw heading in the sensor's own frame (gyro-fused alpha; arbitrary zero on iOS). */
  heading: number;
  /** Heading accumulated without wrapping, relative to the anchor. Can exceed ±360. */
  unwrapped: number;
  /** Raw heading that maps to unwrapped = 0. Null until anchored. */
  anchor: number | null;
  lastHeadingForUnwrap: number | null;
}

export function initialOrientation(): OrientationState {
  return {
    vector: null,
    lastT: null,
    pitch: 0,
    heading: 0,
    unwrapped: 0,
    anchor: null,
    lastHeadingForUnwrap: null,
  };
}

export interface OrientationOptions {
  smoothingMs: number;
  headingFreezeAbovePitchDeg: number;
}

/** Feed one DeviceOrientation reading. Pure: returns a new state. */
export function updateOrientation(
  s: OrientationState,
  reading: EulerReading,
  t: number,
  opts: OrientationOptions,
): OrientationState {
  const raw = cameraVector(reading);
  const dt = s.lastT == null ? 0 : t - s.lastT;
  const vector = smoothVector(s.vector, raw, dt, opts.smoothingMs);
  const pitch = pitchOf(vector);
  const steep = Math.abs(pitch) > opts.headingFreezeAbovePitchDeg;
  const heading = steep ? s.heading : headingOf(vector);

  let unwrapped = s.unwrapped;
  let lastHeadingForUnwrap = s.lastHeadingForUnwrap;
  if (s.anchor != null && !steep) {
    if (lastHeadingForUnwrap != null) unwrapped += wrap180(heading - lastHeadingForUnwrap);
    lastHeadingForUnwrap = heading;
  }
  return { ...s, vector, lastT: t, pitch, heading, unwrapped, lastHeadingForUnwrap };
}

/** Make the current heading the zero point (the doorway). */
export function anchorHere(s: OrientationState): OrientationState {
  return { ...s, anchor: s.heading, unwrapped: 0, lastHeadingForUnwrap: s.heading };
}

/**
 * Re-anchor so the current direction reads as `unwrappedDeg` (used when resuming a
 * saved session after a reload, where the sensor's zero has moved).
 */
export function reanchorTo(s: OrientationState, unwrappedDeg: number): OrientationState {
  return { ...s, anchor: wrap180(s.heading - unwrappedDeg), unwrapped: unwrappedDeg, lastHeadingForUnwrap: s.heading };
}

/** Shift the accumulated heading by a correction (e.g. compass-measured drift). */
export function applyHeadingCorrection(s: OrientationState, correctionDeg: number): OrientationState {
  return { ...s, unwrapped: s.unwrapped + correctionDeg };
}

/**
 * Drift between the gyro and the compass over a span: how far the gyro's change in
 * heading disagrees with the compass's. Positive means the gyro turned further than
 * the compass. Null when there's no compass reading.
 */
export function headingDrift(
  gyroStartUnwrapped: number,
  gyroNowUnwrapped: number,
  compassStart: number | null,
  compassNow: number | null,
): number | null {
  if (compassStart == null || compassNow == null) return null;
  const gyroDelta = gyroNowUnwrapped - gyroStartUnwrapped;
  const compassDelta = compassNow - compassStart;
  return wrap180(gyroDelta - compassDelta);
}

/** Magnitude of devicemotion.rotationRate in deg/s. */
export function rotationRateMagnitude(rate: { alpha: number | null; beta: number | null; gamma: number | null } | null): number {
  if (!rate) return 0;
  return Math.hypot(rate.alpha ?? 0, rate.beta ?? 0, rate.gamma ?? 0);
}
