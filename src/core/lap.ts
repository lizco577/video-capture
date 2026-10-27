import { sliceForProgress } from "./coverage";

// Lap progress. The person may walk either way round the room; the first clear
// turn away from the doorway decides the direction. "Progress" is then the
// heading turned in that direction, so slices always count up 0, 1, 2…

export interface LapState {
  direction: 1 | -1 | null;
  /** Furthest progress reached, in degrees. */
  maxProgress: number;
  /** The slice guidance is working on; only moves forward. */
  guideSlice: number;
  complete: boolean;
}

export interface LapOptions {
  slices: number;
  lapDirectionThresholdDeg: number;
  lapCompleteDeg: number;
}

export function initialLap(): LapState {
  return { direction: null, maxProgress: 0, guideSlice: 0, complete: false };
}

export function progressOf(unwrapped: number, direction: 1 | -1 | null): number {
  return direction == null ? unwrapped : unwrapped * direction;
}

/** Inverse of progressOf: where, in unwrapped heading, a progress angle lies. */
export function unwrappedForProgress(progress: number, direction: 1 | -1 | null): number {
  return direction == null ? progress : progress * direction;
}

export function updateLap(lap: LapState, unwrapped: number, o: LapOptions): LapState {
  let direction = lap.direction;
  if (direction == null && Math.abs(unwrapped) >= o.lapDirectionThresholdDeg) {
    direction = unwrapped > 0 ? 1 : -1;
  }
  if (direction == null) return lap;

  const progress = progressOf(unwrapped, direction);
  const maxProgress = Math.max(lap.maxProgress, progress);
  const width = 360 / o.slices;
  const reached = Math.min(o.slices - 1, Math.floor((maxProgress + width / 2) / width));
  const guideSlice = Math.max(lap.guideSlice, reached);
  const complete = lap.complete || maxProgress >= o.lapCompleteDeg;
  if (
    direction === lap.direction &&
    maxProgress === lap.maxProgress &&
    guideSlice === lap.guideSlice &&
    complete === lap.complete
  ) {
    return lap;
  }
  return { direction, maxProgress, guideSlice, complete };
}

/**
 * The slice the camera is in right now, for coverage. Before the walking direction
 * is decided, the side the person has turned to is taken as provisional, so slice 1
 * (centred 30° away, inside the decision threshold) still counts.
 */
export function currentSlice(lap: LapState, unwrapped: number, slices: number): number {
  const direction = lap.direction ?? (unwrapped < 0 ? -1 : 1);
  return sliceForProgress(progressOf(unwrapped, direction), slices);
}
