// Every tunable threshold for the capture spike lives here.
// UI code reads from this object and never hard-codes a threshold.

export interface DotOptions {
  /** When the dot is pinned to the screen edge, show an arrow pointing the way to turn. */
  edgeArrow: boolean;
  /** Fill a ring around the white circle while the current cell dwells (0 → 0.6 s). */
  dwellFill: boolean;
  /** When the target changes, glide the dot to its next spot instead of jumping. */
  smoothMove: boolean;
  /** The target cell only counts while the circle is inside a zone round the dot. */
  holdZone: boolean;
  /** Glide duration for smoothMove. */
  moveMs: number;
  /** Radius of the hold zone, in degrees from the dot. */
  holdZoneDeg: number;
}

export interface CaptureConfig {
  bands: {
    /** Camera pitch above this (degrees) counts as ceiling. */
    ceilingAbovePitchDeg: number;
    /** Camera pitch below this (degrees) counts as floor. */
    floorBelowPitchDeg: number;
  };
  orientation: {
    /** Low-pass time constant applied to the camera direction vector. */
    smoothingMs: number;
    /** Heading is not updated when the camera points steeper than this (it becomes unstable near ±90°). */
    headingFreezeAbovePitchDeg: number;
    /** Turn needed (degrees from the doorway) before the walking direction is decided. */
    lapDirectionThresholdDeg: number;
    /** Progress (degrees in the walking direction) that counts as back at the start. */
    lapCompleteDeg: number;
    /** At lap end, re-anchor using the compass only if it disagrees by less than this. */
    maxCompassReanchorDeg: number;
  };
  coverage: {
    slices: number;
    /** Continuous time in a cell needed to mark it captured (or retake if quality was bad). */
    dwellMs: number;
  };
  quality: {
    sampleHz: number;
    sampleWidthPx: number;
    /** Variance of the Laplacian at or above this counts as sharp enough for coverage. */
    blurMin: number;
    brightnessMin: number;
    brightnessMax: number;
    /** A quality sample older than this is treated as "unknown" (not good). */
    staleMs: number;
  };
  motion: {
    /** Rotation rate (deg/s, magnitude of devicemotion.rotationRate) allowed while a cell dwells. */
    maxRotationRateDegPerSec: number;
  };
  autoPause: {
    /** Rotation rate above which coverage pauses. */
    rotationRateDegPerSec: number;
    /** Blur score below which coverage pauses (lower than quality.blurMin so plain walls don't trigger it). */
    blurBelow: number;
    /** Conditions must be calm this long before coverage resumes. */
    resumeAfterStableMs: number;
  };
  guidance: {
    targetPitchDeg: { ceiling: number; walls: number; floor: number };
    /** Approximate field of view used to place the dot on screen. */
    verticalFovDeg: number;
    horizontalFovDeg: number;
    alignToleranceDeg: number;
    /** A gap this close (degrees) to straight ahead is described without left/right. */
    straightAheadDeg: number;
    /** A gap further than this (degrees) is described as behind you. */
    behindDeg: number;
    /** Minimum gap between spoken instructions. */
    minSpeechIntervalMs: number;
    /** Blue-dot UX variants. Each can be switched off to compare (simulator panel or ?dot=…). */
    dot: DotOptions;
  };
  progress: { upTo: number; words: string }[];
  camera: {
    /** Ideal capture size. The browser picks the nearest it supports; the actual size is logged. */
    idealWidth: number;
    idealHeight: number;
  };
  recording: {
    mimeTypes: string[];
    timesliceMs: number;
    videoBitsPerSecond: number;
  };
  logging: {
    sampleIntervalMs: number;
    persistIntervalMs: number;
  };
}

export const config: CaptureConfig = {
  bands: {
    ceilingAbovePitchDeg: 25,
    floorBelowPitchDeg: -20,
  },
  orientation: {
    smoothingMs: 150,
    headingFreezeAbovePitchDeg: 75,
    lapDirectionThresholdDeg: 20,
    lapCompleteDeg: 350,
    maxCompassReanchorDeg: 30,
  },
  coverage: {
    slices: 12,
    dwellMs: 600,
  },
  quality: {
    sampleHz: 5,
    sampleWidthPx: 160,
    blurMin: 50,
    brightnessMin: 35,
    brightnessMax: 230,
    staleMs: 1000,
  },
  motion: {
    maxRotationRateDegPerSec: 45,
  },
  autoPause: {
    rotationRateDegPerSec: 90,
    blurBelow: 12,
    resumeAfterStableMs: 600,
  },
  guidance: {
    targetPitchDeg: { ceiling: 45, walls: 0, floor: -45 },
    verticalFovDeg: 60,
    horizontalFovDeg: 45,
    alignToleranceDeg: 10,
    straightAheadDeg: 20,
    behindDeg: 135,
    minSpeechIntervalMs: 2500,
    dot: {
      edgeArrow: true,
      dwellFill: true,
      smoothMove: true,
      holdZone: true,
      moveMs: 350,
      holdZoneDeg: 12,
    },
  },
  progress: [
    { upTo: 0.15, words: "Just started" },
    { upTo: 0.35, words: "About a quarter" },
    { upTo: 0.5, words: "Almost halfway" },
    { upTo: 0.8, words: "More than halfway" },
    { upTo: Infinity, words: "Nearly done" },
  ],
  camera: {
    idealWidth: 1920,
    idealHeight: 1080,
  },
  recording: {
    mimeTypes: ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"],
    timesliceMs: 2000,
    videoBitsPerSecond: 4_000_000,
  },
  logging: {
    sampleIntervalMs: 100,
    persistIntervalMs: 5000,
  },
};
