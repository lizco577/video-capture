import { describe, expect, it } from "vitest";
import { currentSlice, initialLap, updateLap, type LapState } from "./lap";
import { deltaToTarget, dotPosition, gapInstruction, lapInstruction, lapTarget, nearestGap } from "./guidance";
import { initialCoverage, skipCell, stepCoverage, type Band, type CoverageState } from "./coverage";
import { config } from "../config";

const lapOpts = {
  slices: 12,
  lapDirectionThresholdDeg: config.orientation.lapDirectionThresholdDeg,
  lapCompleteDeg: config.orientation.lapCompleteDeg,
};
const g = config.guidance;

function walk(lap: LapState, from: number, to: number) {
  const step = to > from ? 5 : -5;
  for (let h = from; step > 0 ? h <= to : h >= to; h += step) lap = updateLap(lap, h, lapOpts);
  return lap;
}

function capture(cov: CoverageState, slice: number, band: Band, t: number) {
  const a = stepCoverage(cov, { t, slice, band, good: true, frozen: false }, 600).state;
  return stepCoverage(a, { t: t + 600, slice, band, good: true, frozen: false }, 600).state;
}

describe("lap", () => {
  it("waits for a clear turn before choosing a direction", () => {
    let lap = walk(initialLap(), 0, 15);
    expect(lap.direction).toBeNull();
    expect(currentSlice(lap, 10, 12)).toBe(0);
    // Slice 1 is centred at 30°, before the direction is decided: provisional side counts.
    expect(currentSlice(lap, 25, 12)).toBe(1);
    expect(currentSlice(lap, -25, 12)).toBe(1);
    lap = updateLap(lap, 21, lapOpts);
    expect(lap.direction).toBe(1);
    expect(currentSlice(lap, 21, 12)).toBe(1);
    expect(lap.guideSlice).toBe(1);
  });

  it("counts a counter-clockwise walk as positive progress", () => {
    const lap = walk(initialLap(), 0, -100);
    expect(lap.direction).toBe(-1);
    expect(lap.maxProgress).toBe(100);
    expect(currentSlice(lap, -100, 12)).toBe(3);
    expect(lap.guideSlice).toBe(3);
  });

  it("guide slice only moves forward", () => {
    let lap = walk(initialLap(), 0, 125);
    expect(lap.guideSlice).toBe(4);
    lap = walk(lap, 125, 40);
    expect(lap.guideSlice).toBe(4);
  });

  it("completes when the walk gets back to the doorway heading", () => {
    let lap = walk(initialLap(), 0, 345);
    expect(lap.complete).toBe(false);
    lap = walk(lap, 345, 350);
    expect(lap.complete).toBe(true);
    expect(lap.guideSlice).toBe(11);
  });
});

describe("lap guidance", () => {
  it("leads ceiling → walls → floor, then a step along the wall", () => {
    let cov = initialCoverage(12);
    const lap = initialLap();
    expect(lapTarget(cov, lap, g)).toMatchObject({ kind: "band", band: "ceiling", slice: 0, pitch: 45 });
    cov = capture(cov, 0, "ceiling", 0);
    expect(lapTarget(cov, lap, g)).toMatchObject({ kind: "band", band: "walls" });
    cov = capture(cov, 0, "walls", 1000);
    expect(lapTarget(cov, lap, g)).toMatchObject({ kind: "band", band: "floor", pitch: -45 });
    cov = skipCell(cov, 0, "floor", 2000).state;
    const t = lapTarget(cov, lap, g);
    expect(t).toMatchObject({ kind: "step", slice: 1, progress: 30 });
    expect(lapInstruction(t)).toBe("Take a step along the wall.");
  });

  it("instructions are plain sentences", () => {
    expect(lapInstruction({ kind: "band", slice: 0, band: "ceiling", pitch: 45, progress: 0 })).toBe(
      "Point your phone up at the ceiling. Follow the blue dot.",
    );
  });

  it("after the last slice, the step target is back at the doorway (360°)", () => {
    let cov = initialCoverage(12);
    for (const b of ["ceiling", "walls", "floor"] as const) cov = capture(cov, 11, b, 0);
    const lap = walk(initialLap(), 0, 330);
    expect(lapTarget(cov, lap, g)).toMatchObject({ kind: "step", slice: 0, progress: 360 });
  });

  it("delta follows the walking direction", () => {
    const lap = walk(initialLap(), 0, -60); // walking counter-clockwise
    const target = { kind: "band" as const, slice: 3, band: "walls" as const, pitch: 0, progress: 90 };
    // Progress 90 is at unwrapped -90: 30° further to the left of -60.
    expect(deltaToTarget(target, lap, -60, 10)).toEqual({ dHeading: -30, dPitch: -10 });
  });
});

describe("dot position", () => {
  const vp = { width: 393, height: 852, marginPx: 24 };

  it("is centred and aligned when on target", () => {
    expect(dotPosition({ dHeading: 0, dPitch: 0 }, vp, g)).toEqual({ x: 0, y: 0, onScreen: true, aligned: true });
  });

  it("moves up for targets above and right for targets to the right", () => {
    const p = dotPosition({ dHeading: 10, dPitch: 15 }, vp, g);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(0);
    expect(p.onScreen).toBe(true);
    expect(p.aligned).toBe(false);
  });

  it("clamps to the screen edge for far targets and keeps the direction", () => {
    const p = dotPosition({ dHeading: 0, dPitch: 90 }, vp, g);
    expect(p.onScreen).toBe(false);
    expect(p.y).toBeCloseTo(-(vp.height / 2 - vp.marginPx));
    expect(p.x).toBe(0);
  });

  it("flips when the screen is upside down", () => {
    const p = dotPosition({ dHeading: 10, dPitch: 10 }, vp, g, 180);
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeGreaterThan(0);
  });
});

describe("gap guidance", () => {
  it("phrases direction from where the person stands", () => {
    expect(gapInstruction("ceiling", -60, g)).toBe("Point up to your left.");
    expect(gapInstruction("floor", 70, g)).toBe("Point down to your right.");
    expect(gapInstruction("walls", 5, g)).toBe("Point at the wall in front of you.");
    expect(gapInstruction("ceiling", 170, g)).toBe("Point up behind you.");
    expect(gapInstruction("floor", -10, g)).toBe("Point down in front of you.");
  });

  it("picks the closest gap, turning the short way round", () => {
    let cov = initialCoverage(12);
    for (let s = 0; s < 12; s++)
      for (const b of ["ceiling", "walls", "floor"] as const) if (!(s === 2 && b === "floor") && !(s === 9 && b === "ceiling")) cov = capture(cov, s, b, s * 10000);
    const lap = walk(initialLap(), 0, 360);
    // Standing at the doorway again (unwrapped 360), looking level.
    const near = nearestGap(cov, lap, 360, 0, g)!;
    expect(near).toMatchObject({ slice: 2, band: "floor" });
    const d = deltaToTarget(near, lap, 360, 0);
    expect(d.dHeading).toBeCloseTo(60);
    expect(gapInstruction(near.band, d.dHeading, g)).toBe("Point down to your right.");
    // Looking up and to the left instead, the ceiling gap at slice 9 is closer.
    const other = nearestGap(cov, lap, 280, 40, g)!;
    expect(other).toMatchObject({ slice: 9, band: "ceiling" });
    expect(gapInstruction(other.band, deltaToTarget(other, lap, 360, 0).dHeading, g)).toBe("Point up to your left.");
  });

  it("returns null when nothing is missing", () => {
    let cov = initialCoverage(1);
    for (const b of ["ceiling", "walls", "floor"] as const) cov = capture(cov, 0, b, 0);
    expect(nearestGap(cov, initialLap(), 0, 0, g)).toBeNull();
  });
});

describe("dot clamping with uneven insets", () => {
  it("stops below the top bar and above the ring", () => {
    const vp = { width: 393, height: 852, marginPx: 32, topPx: 190, bottomPx: 330 };
    expect(dotPosition({ dHeading: 0, dPitch: 80 }, vp, g).y).toBeCloseTo(-(426 - 190));
    expect(dotPosition({ dHeading: 0, dPitch: -80 }, vp, g).y).toBeCloseTo(426 - 330);
  });
});
