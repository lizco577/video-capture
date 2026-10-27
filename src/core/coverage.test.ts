import { describe, expect, it } from "vitest";
import {
  bandForPitch,
  cellState,
  counts,
  gaps,
  initialCoverage,
  progressFraction,
  progressWords,
  skipCell,
  sliceAttempted,
  sliceForProgress,
  stepCoverage,
  type Band,
  type CoverageState,
} from "./coverage";
import { config } from "../config";

const DWELL = 600;

/** Feed the same input every `stepMs` from t0 for `durationMs`. */
function hold(
  s: CoverageState,
  slice: number | null,
  band: Band,
  good: boolean,
  t0: number,
  durationMs: number,
  frozen = false,
  stepMs = 50,
) {
  let state = s;
  const changes = [];
  for (let t = t0; t <= t0 + durationMs; t += stepMs) {
    const r = stepCoverage(state, { t, slice, band, good, frozen }, DWELL);
    state = r.state;
    changes.push(...r.changes);
  }
  return { state, changes };
}

describe("bandForPitch", () => {
  it("uses the config thresholds", () => {
    expect(bandForPitch(26, config.bands)).toBe("ceiling");
    expect(bandForPitch(25, config.bands)).toBe("walls");
    expect(bandForPitch(-20, config.bands)).toBe("walls");
    expect(bandForPitch(-21, config.bands)).toBe("floor");
  });
});

describe("sliceForProgress", () => {
  it("centres slice 0 on the doorway", () => {
    expect(sliceForProgress(0, 12)).toBe(0);
    expect(sliceForProgress(14.9, 12)).toBe(0);
    expect(sliceForProgress(-14.9, 12)).toBe(0);
    expect(sliceForProgress(15, 12)).toBe(1);
    expect(sliceForProgress(-16, 12)).toBe(11);
    expect(sliceForProgress(359, 12)).toBe(0);
    expect(sliceForProgress(375, 12)).toBe(1);
  });
});

describe("dwell rule", () => {
  it("captures after 0.6 s of continuous good dwell", () => {
    const short = hold(initialCoverage(12), 2, "walls", true, 0, 550);
    expect(cellState(short.state, 2, "walls")).toBe("missing");
    const long = hold(initialCoverage(12), 2, "walls", true, 0, 600);
    expect(cellState(long.state, 2, "walls")).toBe("captured");
    expect(long.changes).toEqual([{ slice: 2, band: "walls", from: "missing", to: "captured", t: 600, reason: "dwell-good" }]);
  });

  it("leaving the cell restarts the timer", () => {
    let { state } = hold(initialCoverage(12), 2, "walls", true, 0, 400);
    ({ state } = hold(state, 2, "ceiling", true, 450, 100));
    ({ state } = hold(state, 2, "walls", true, 600, 400));
    expect(cellState(state, 2, "walls")).toBe("missing");
  });

  it("bad quality for the dwell time marks retake (yellow)", () => {
    const { state, changes } = hold(initialCoverage(12), 0, "floor", false, 0, 700);
    expect(cellState(state, 0, "floor")).toBe("retake");
    expect(changes[0].reason).toBe("dwell-bad");
  });

  it("a bad frame mid-dwell resets the good streak", () => {
    let { state } = hold(initialCoverage(12), 0, "walls", true, 0, 400);
    ({ state } = hold(state, 0, "walls", false, 450, 0));
    ({ state } = hold(state, 0, "walls", true, 500, 400));
    // Good streak only 400 ms so far, and the bad patch was short: still missing.
    expect(cellState(state, 0, "walls")).toBe("missing");
    ({ state } = hold(state, 0, "walls", true, 950, 200));
    expect(cellState(state, 0, "walls")).toBe("captured");
  });

  it("arriving while still turning (briefly bad) doesn't flash yellow", () => {
    let { state, changes } = hold(initialCoverage(12), 5, "walls", false, 0, 400);
    ({ state, changes } = hold(state, 5, "walls", true, 450, 700));
    expect(changes.map((c) => c.to)).toEqual(["captured"]);
  });

  it("captured never goes back down", () => {
    let { state } = hold(initialCoverage(12), 1, "walls", true, 0, 700);
    ({ state } = hold(state, 1, "walls", false, 800, 2000));
    expect(cellState(state, 1, "walls")).toBe("captured");
  });

  it("freezing (paused or auto-paused) stops and resets the dwell", () => {
    let { state } = hold(initialCoverage(12), 3, "walls", true, 0, 400);
    ({ state } = hold(state, 3, "walls", true, 450, 1000, true));
    expect(cellState(state, 3, "walls")).toBe("missing");
    expect(state.dwell).toBeNull();
    ({ state } = hold(state, 3, "walls", true, 1500, 400));
    expect(cellState(state, 3, "walls")).toBe("missing");
  });

  it("unknown slice counts nothing", () => {
    const { state } = hold(initialCoverage(12), null, "walls", true, 0, 2000);
    expect(counts(state).captured).toBe(0);
  });
});

describe("skip", () => {
  it("marks a cell skipped and a later good dwell can still capture it", () => {
    let { state, changes } = skipCell(initialCoverage(12), 4, "floor", 10);
    expect(cellState(state, 4, "floor")).toBe("skipped");
    expect(changes[0]).toMatchObject({ from: "missing", to: "skipped", reason: "skip" });
    ({ state } = hold(state, 4, "floor", false, 100, 1000));
    expect(cellState(state, 4, "floor")).toBe("skipped");
    ({ state } = hold(state, 4, "floor", true, 1200, 700));
    expect(cellState(state, 4, "floor")).toBe("captured");
  });

  it("doesn't skip a captured cell", () => {
    const { state } = hold(initialCoverage(12), 4, "floor", true, 0, 700);
    expect(skipCell(state, 4, "floor", 800).changes).toEqual([]);
  });
});

describe("gaps and progress", () => {
  it("lists missing and retake cells, not captured or skipped", () => {
    let s = initialCoverage(2);
    s = hold(s, 0, "ceiling", true, 0, 700).state;
    s = hold(s, 0, "walls", false, 1000, 700).state;
    s = skipCell(s, 0, "floor", 2000).state;
    expect(gaps(s)).toEqual([
      { slice: 0, band: "walls" },
      { slice: 1, band: "ceiling" },
      { slice: 1, band: "walls" },
      { slice: 1, band: "floor" },
    ]);
    expect(sliceAttempted(s, 0)).toBe(true);
    expect(sliceAttempted(s, 1)).toBe(false);
    expect(progressFraction(s)).toBeCloseTo(2 / 6);
  });

  it("describes progress in words", () => {
    const words = (f: number) => progressWords(f, config.progress);
    expect(words(0)).toBe("Just started");
    expect(words(0.25)).toBe("About a quarter");
    expect(words(0.45)).toBe("Almost halfway");
    expect(words(0.6)).toBe("More than halfway");
    expect(words(0.95)).toBe("Nearly done");
    expect(words(1)).toBe("Nearly done");
  });
});
