import { describe, expect, it } from "vitest";
import {
  arrowAngleDeg,
  blendPosition,
  dwellProgress,
  easeOutCubic,
  inHoldZone,
  isTargetCell,
  parseDotParam,
  targetKey,
  suspendDwell,
  zoneRadiusPx,
} from "./dot";
import { initialCoverage, stepCoverage } from "./coverage";

const ceiling0 = { kind: "band" as const, slice: 0, band: "ceiling" as const, pitch: 45, progress: 0 };

describe("targetKey", () => {
  it("distinguishes band targets, step targets and none", () => {
    expect(targetKey(ceiling0)).toBe("0:ceiling");
    expect(targetKey({ kind: "step", slice: 1, pitch: 0, progress: 30 })).toBe("step:1");
    expect(targetKey(null)).toBe("none");
  });
});

describe("blendPosition", () => {
  it("eases from the old spot to the new one and finishes on it", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: -50 };
    const start = blendPosition(from, to, 0, 350);
    const mid = blendPosition(from, to, 175, 350);
    const end = blendPosition(from, to, 350, 350);
    expect(start).toEqual({ x: 0, y: 0, done: false });
    expect(mid.x).toBeGreaterThan(50); // ease-out: past halfway at half time
    expect(mid.done).toBe(false);
    expect(end).toEqual({ x: 100, y: -50, done: true });
  });

  it("jumps straight there when the duration is zero", () => {
    expect(blendPosition({ x: 0, y: 0 }, { x: 5, y: 5 }, 0, 0)).toEqual({ x: 5, y: 5, done: true });
  });

  it("ease is clamped", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("arrowAngleDeg", () => {
  it("points right, down, left and up", () => {
    expect(arrowAngleDeg({ x: 10, y: 0 })).toBeCloseTo(0);
    expect(arrowAngleDeg({ x: 0, y: 10 })).toBeCloseTo(90);
    expect(arrowAngleDeg({ x: -10, y: 0 })).toBeCloseTo(180);
    expect(arrowAngleDeg({ x: 0, y: -10 })).toBeCloseTo(-90);
  });
});

describe("hold zone", () => {
  it("is round", () => {
    expect(inHoldZone({ dHeading: 8, dPitch: 8 }, 12)).toBe(true);
    expect(inHoldZone({ dHeading: 9, dPitch: 9 }, 12)).toBe(false);
  });

  it("converts degrees to pixels with the dot's scale", () => {
    expect(zoneRadiusPx(12, 393, 45)).toBeCloseTo(104.8, 1);
  });

  it("only suspends the cell the dot points at", () => {
    const on = { holdZone: true };
    const off = { holdZone: false };
    // In the ceiling band at 26° but far from the dot at 45°: not judged yet.
    expect(suspendDwell(true, false, on)).toBe(true);
    expect(suspendDwell(true, true, on)).toBe(false);
    // A different cell passed on the way still counts.
    expect(suspendDwell(false, false, on)).toBe(false);
    // Feature off: the old behaviour.
    expect(suspendDwell(true, false, off)).toBe(false);
  });

  it("approaching the target outside the zone doesn't turn it yellow", () => {
    let cov = initialCoverage(12);
    // 1 s in the target cell but outside the zone, with bad quality: suspended, stays missing.
    for (let t = 0; t <= 1000; t += 50) {
      cov = stepCoverage(cov, { t, slice: 0, band: "ceiling", good: false, frozen: suspendDwell(true, false, { holdZone: true }) }, 600).state;
    }
    expect(cov.cells[0]).toBe("missing");
    // Then into the zone with good quality: captured after the dwell.
    for (let t = 1050; t <= 1700; t += 50) {
      cov = stepCoverage(cov, { t, slice: 0, band: "ceiling", good: true, frozen: suspendDwell(true, true, { holdZone: true }) }, 600).state;
    }
    expect(cov.cells[0]).toBe("captured");
  });

  it("isTargetCell matches only band targets on the same cell", () => {
    expect(isTargetCell(ceiling0, { slice: 0, band: "ceiling" })).toBe(true);
    expect(isTargetCell(ceiling0, { slice: 0, band: "walls" })).toBe(false);
    expect(isTargetCell({ kind: "step", slice: 0, pitch: 0, progress: 0 }, { slice: 0, band: "walls" })).toBe(false);
    expect(isTargetCell(null, { slice: 0, band: "walls" })).toBe(false);
  });
});

describe("dwellProgress", () => {
  it("fills over the dwell time from when quality became good", () => {
    let cov = initialCoverage(12);
    cov = stepCoverage(cov, { t: 1000, slice: 0, band: "walls", good: true, frozen: false }, 600).state;
    expect(dwellProgress(cov.dwell, 1000, 600)).toBe(0);
    expect(dwellProgress(cov.dwell, 1300, 600)).toBeCloseTo(0.5);
    expect(dwellProgress(cov.dwell, 2000, 600)).toBe(1);
  });

  it("is empty with no dwell or while quality is bad", () => {
    expect(dwellProgress(null, 0, 600)).toBe(0);
    const cov = stepCoverage(initialCoverage(12), { t: 0, slice: 0, band: "walls", good: false, frozen: false }, 600).state;
    expect(dwellProgress(cov.dwell, 300, 600)).toBe(0);
  });
});

describe("parseDotParam", () => {
  it("reads a list, all and none", () => {
    expect(parseDotParam(null)).toBeNull();
    expect(parseDotParam("arrow,zone")).toEqual({ edgeArrow: true, dwellFill: false, smoothMove: false, holdZone: true });
    expect(parseDotParam("all")).toEqual({ edgeArrow: true, dwellFill: true, smoothMove: true, holdZone: true });
    expect(parseDotParam("none")).toEqual({ edgeArrow: false, dwellFill: false, smoothMove: false, holdZone: false });
  });
});
