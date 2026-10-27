import { wrap180 } from "./angles";
import { BANDS, type Band, type CellRef, type CoverageState, cellState, gaps, sliceCenterProgress } from "./coverage";
import { type LapState, progressOf, unwrappedForProgress } from "./lap";

// Where the blue dot should lead, and what to say.

export interface GuidanceConfig {
  targetPitchDeg: Record<Band, number>;
  verticalFovDeg: number;
  horizontalFovDeg: number;
  alignToleranceDeg: number;
  straightAheadDeg: number;
  behindDeg: number;
}

export type Target =
  | { kind: "band"; slice: number; band: Band; pitch: number; progress: number }
  | { kind: "step"; slice: number; pitch: number; progress: number };

/** During the lap: next missing band of the guide slice (ceiling → walls → floor), else the next slice. */
export function lapTarget(cov: CoverageState, lap: LapState, g: GuidanceConfig): Target {
  const slice = lap.guideSlice;
  for (const band of BANDS) {
    if (cellState(cov, slice, band) === "missing") {
      return { kind: "band", slice, band, pitch: g.targetPitchDeg[band], progress: sliceCenterProgress(slice, cov.slices) };
    }
  }
  const next = slice + 1;
  return {
    kind: "step",
    slice: next % cov.slices,
    pitch: g.targetPitchDeg.walls,
    progress: sliceCenterProgress(next, cov.slices),
  };
}

/** After the lap: the gap closest to where the camera points now. Null when there are no gaps. */
export function nearestGap(
  cov: CoverageState,
  lap: LapState,
  unwrapped: number,
  pitch: number,
  g: GuidanceConfig,
): (Target & { kind: "band" }) | null {
  const progressNow = progressOf(unwrapped, lap.direction);
  let best: (Target & { kind: "band" }) | null = null;
  let bestCost = Infinity;
  for (const gap of gaps(cov)) {
    const target = gapTarget(gap, cov.slices, g);
    const dH = wrap180(target.progress - progressNow);
    const dP = target.pitch - pitch;
    const cost = Math.hypot(dH, dP);
    if (cost < bestCost) {
      bestCost = cost;
      best = { ...target, progress: progressNow + dH };
    }
  }
  return best;
}

function gapTarget(gap: CellRef, slices: number, g: GuidanceConfig): Target & { kind: "band" } {
  return {
    kind: "band",
    slice: gap.slice,
    band: gap.band,
    pitch: g.targetPitchDeg[gap.band],
    progress: sliceCenterProgress(gap.slice, slices),
  };
}

/** Angle from the camera to the target: positive dHeading = to the right, positive dPitch = up. */
export function deltaToTarget(target: Target, lap: LapState, unwrapped: number, pitch: number) {
  const targetUnwrapped = unwrappedForProgress(target.progress, lap.direction);
  return { dHeading: wrap180(targetUnwrapped - unwrapped), dPitch: target.pitch - pitch };
}

export interface DotPosition {
  /** Offset from screen centre, in px. */
  x: number;
  y: number;
  /** False when the dot was clamped to the screen edge. */
  onScreen: boolean;
  aligned: boolean;
}

/**
 * Place the dot on screen. screenAngle is screen.orientation.angle: in a rotated
 * screen the axes swap or flip, so the dot still moves the way the person should turn.
 */
export function dotPosition(
  d: { dHeading: number; dPitch: number },
  // topPx / bottomPx keep the dot clear of the top bar and the ring (default: marginPx).
  viewport: { width: number; height: number; marginPx: number; topPx?: number; bottomPx?: number },
  g: GuidanceConfig,
  screenAngle = 0,
): DotPosition {
  const portrait = screenAngle % 180 === 0;
  const fovX = portrait ? g.horizontalFovDeg : g.verticalFovDeg;
  const fovY = portrait ? g.verticalFovDeg : g.horizontalFovDeg;
  let x = (d.dHeading / fovX) * viewport.width;
  let y = (-d.dPitch / fovY) * viewport.height;
  if (screenAngle === 180) {
    x = -x;
    y = -y;
  }
  const maxX = viewport.width / 2 - viewport.marginPx;
  const maxUp = viewport.height / 2 - (viewport.topPx ?? viewport.marginPx);
  const maxDown = viewport.height / 2 - (viewport.bottomPx ?? viewport.marginPx);
  const scale = Math.max(Math.abs(x) / maxX, y < 0 ? -y / maxUp : y / maxDown, 1);
  const aligned = Math.abs(d.dHeading) < g.alignToleranceDeg && Math.abs(d.dPitch) < g.alignToleranceDeg;
  // "+ 0" turns -0 into 0 so callers can compare positions directly.
  return { x: x / scale + 0, y: y / scale + 0, onScreen: scale === 1, aligned };
}

export function lapInstruction(target: Target): string {
  if (target.kind === "step") return "Take a step along the wall.";
  switch (target.band) {
    case "ceiling":
      return "Point your phone up at the ceiling. Follow the blue dot.";
    case "walls":
      return "Point your phone at the wall. Follow the blue dot.";
    case "floor":
      return "Point your phone down at the floor. Follow the blue dot.";
  }
}

/** Plain-words direction to a gap from where the person stands, e.g. "Point up to your left." */
export function gapInstruction(band: Band, dHeading: number, g: GuidanceConfig): string {
  const abs = Math.abs(dHeading);
  const side = abs >= g.behindDeg ? "behind you" : abs <= g.straightAheadDeg ? null : dHeading < 0 ? "to your left" : "to your right";
  switch (band) {
    case "ceiling":
      return side ? `Point up ${side}.` : "Point up in front of you.";
    case "floor":
      return side ? `Point down ${side}.` : "Point down in front of you.";
    case "walls":
      return side ? `Point at the wall ${side}.` : "Point at the wall in front of you.";
  }
}
