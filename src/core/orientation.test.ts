import { describe, expect, it } from "vitest";
import {
  anchorHere,
  cameraVector,
  eulerFor,
  headingDrift,
  headingOf,
  initialOrientation,
  pitchOf,
  reanchorTo,
  rotationRateMagnitude,
  smoothVector,
  updateOrientation,
} from "./orientation";
import { wrap180, wrap360 } from "./angles";

const opts = { smoothingMs: 150, headingFreezeAbovePitchDeg: 75 };
const noSmoothing = { smoothingMs: 0, headingFreezeAbovePitchDeg: 75 };

describe("angles", () => {
  it("wraps", () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(180);
    expect(wrap360(-30)).toBe(330);
    expect(wrap360(725)).toBe(5);
  });
});

describe("cameraVector", () => {
  it("phone upright in portrait looks at the horizon", () => {
    const v = cameraVector({ alpha: 0, beta: 90, gamma: 0 });
    expect(pitchOf(v)).toBeCloseTo(0, 6);
    expect(headingOf(v)).toBeCloseTo(0, 6);
  });

  it("phone flat on its back looks at the floor", () => {
    expect(pitchOf(cameraVector({ alpha: 0, beta: 0, gamma: 0 }))).toBeCloseTo(-90, 6);
  });

  it("tilting the top back points the camera up", () => {
    expect(pitchOf(cameraVector({ alpha: 0, beta: 135, gamma: 0 }))).toBeCloseTo(45, 6);
    expect(pitchOf(cameraVector({ alpha: 0, beta: 60, gamma: 0 }))).toBeCloseTo(-30, 6);
  });

  it("heading is clockwise and opposite to alpha", () => {
    expect(headingOf(cameraVector({ alpha: 90, beta: 90, gamma: 0 }))).toBeCloseTo(-90, 6);
    expect(headingOf(cameraVector({ alpha: -45, beta: 90, gamma: 0 }))).toBeCloseTo(45, 6);
  });

  it("roll (gamma) while upright doesn't change where the camera points", () => {
    // Upright phone rolled 30° about its camera axis: Euler angles change, direction doesn't.
    // This is the gimbal case raw beta gets wrong.
    const rolled = cameraVector({ alpha: 0, beta: 90, gamma: 30 });
    expect(pitchOf(rolled)).toBeCloseTo(0, 1);
  });

  it("eulerFor round-trips pitch and heading", () => {
    for (const [p, h] of [
      [0, 0],
      [40, 120],
      [-50, -170],
      [10, 90],
    ]) {
      const v = cameraVector(eulerFor(p, h));
      expect(pitchOf(v)).toBeCloseTo(p, 6);
      expect(wrap180(headingOf(v) - h)).toBeCloseTo(0, 6);
    }
  });
});

describe("smoothVector", () => {
  it("moves part of the way, depending on elapsed time", () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 1, y: 0, z: 0 };
    const short = smoothVector(a, b, 15, 150);
    const long = smoothVector(a, b, 300, 150);
    expect(short.x).toBeGreaterThan(0);
    expect(short.x).toBeLessThan(long.x);
    expect(long.x).toBeLessThan(1);
  });

  it("has no glitch across the ±180° heading seam", () => {
    let s = initialOrientation();
    let t = 0;
    for (const h of [175, 178, -179, -176, -172]) {
      s = updateOrientation(s, eulerFor(0, h), (t += 16), opts);
      expect(Math.abs(wrap180(s.heading - h))).toBeLessThan(20);
    }
  });
});

describe("updateOrientation", () => {
  it("unwraps relative heading through a full turn", () => {
    let s = initialOrientation();
    s = updateOrientation(s, eulerFor(0, 100), 0, noSmoothing);
    s = anchorHere(s);
    let t = 0;
    for (let turned = 10; turned <= 370; turned += 10) {
      s = updateOrientation(s, eulerFor(0, 100 + turned), (t += 50), noSmoothing);
    }
    expect(s.unwrapped).toBeCloseTo(370, 4);
  });

  it("unwraps counter-clockwise turns as negative", () => {
    let s = anchorHere(updateOrientation(initialOrientation(), eulerFor(0, 0), 0, noSmoothing));
    let t = 0;
    for (let turned = 10; turned <= 200; turned += 10) {
      s = updateOrientation(s, eulerFor(0, -turned), (t += 50), noSmoothing);
    }
    expect(s.unwrapped).toBeCloseTo(-200, 4);
  });

  it("freezes heading when pointing nearly straight up, then resumes without a jump", () => {
    let s = anchorHere(updateOrientation(initialOrientation(), eulerFor(0, 0), 0, noSmoothing));
    s = updateOrientation(s, eulerFor(0, 20), 50, noSmoothing);
    s = updateOrientation(s, eulerFor(85, 160), 100, noSmoothing);
    expect(s.unwrapped).toBeCloseTo(20, 4);
    s = updateOrientation(s, eulerFor(10, 30), 150, noSmoothing);
    expect(s.unwrapped).toBeCloseTo(30, 4);
  });

  it("doesn't accumulate heading before it is anchored", () => {
    let s = updateOrientation(initialOrientation(), eulerFor(0, 0), 0, noSmoothing);
    s = updateOrientation(s, eulerFor(0, 90), 50, noSmoothing);
    expect(s.unwrapped).toBe(0);
  });

  it("smoothing lags a step change, then converges", () => {
    let s = updateOrientation(initialOrientation(), eulerFor(0, 0), 0, opts);
    s = updateOrientation(s, eulerFor(40, 0), 16, opts);
    expect(s.pitch).toBeGreaterThan(0);
    expect(s.pitch).toBeLessThan(20);
    for (let t = 32; t < 1500; t += 16) s = updateOrientation(s, eulerFor(40, 0), t, opts);
    expect(s.pitch).toBeCloseTo(40, 1);
  });

  it("reanchorTo makes the current direction read as the given progress", () => {
    let s = updateOrientation(initialOrientation(), eulerFor(0, -70), 0, noSmoothing);
    s = reanchorTo(s, 150);
    expect(s.unwrapped).toBe(150);
    s = updateOrientation(s, eulerFor(0, -60), 50, noSmoothing);
    expect(s.unwrapped).toBeCloseTo(160, 4);
  });
});

describe("headingDrift", () => {
  it("compares gyro turn against compass turn", () => {
    expect(headingDrift(0, 365, 10, 10)).toBeCloseTo(5);
    expect(headingDrift(0, 352, 200, 200)).toBeCloseTo(-8);
    expect(headingDrift(0, 360, null, 3)).toBeNull();
  });
});

describe("rotationRateMagnitude", () => {
  it("combines axes and tolerates nulls", () => {
    expect(rotationRateMagnitude({ alpha: 3, beta: 4, gamma: 0 })).toBe(5);
    expect(rotationRateMagnitude({ alpha: null, beta: null, gamma: 12 })).toBe(12);
    expect(rotationRateMagnitude(null)).toBe(0);
  });
});
