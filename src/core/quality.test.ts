import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { analyzeFrame, frameIsGood, laplacianVariance, qualityProblems, toGrey } from "./quality";
import { config } from "../config";

function fixture(name: string) {
  const png = PNG.sync.read(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
  return analyzeFrame(png.data, png.width, png.height);
}

function solid(w: number, h: number, v: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) a.set([v, v, v, 255], i);
  return a;
}

function checkerboard(w: number, h: number, cell: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 230 : 25;
      a.set([v, v, v, 255], (y * w + x) * 4);
    }
  return a;
}

describe("quality primitives", () => {
  it("greyscale uses Rec.601 weights", () => {
    const g = toGrey([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255], 3, 1);
    expect(g[0]).toBeCloseTo(76.245, 2);
    expect(g[1]).toBeCloseTo(149.685, 2);
    expect(g[2]).toBeCloseTo(29.07, 2);
  });

  it("a flat image has zero Laplacian variance", () => {
    expect(analyzeFrame(solid(32, 24, 128), 32, 24)).toEqual({ blur: 0, brightness: 128 });
  });

  it("finer detail scores sharper", () => {
    const fine = analyzeFrame(checkerboard(64, 48, 2), 64, 48).blur;
    const coarse = analyzeFrame(checkerboard(64, 48, 16), 64, 48).blur;
    expect(fine).toBeGreaterThan(coarse);
  });

  it("tiny buffers don't crash", () => {
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0);
  });
});

describe("fixture images against config thresholds", () => {
  const sharp = fixture("room-sharp.png");
  const blurred = fixture("room-motion-blur.png");
  const heavyBlur = fixture("room-heavy-blur.png");
  const dim = fixture("room-dim.png");
  const bright = fixture("room-overexposed.png");

  it("sharp room passes", () => {
    expect(qualityProblems(sharp, config.quality)).toEqual([]);
    expect(frameIsGood(sharp, config.quality)).toBe(true);
  });

  it("blurred room is flagged blurry and scores far below sharp", () => {
    expect(qualityProblems(blurred, config.quality)).toContain("blurry");
    expect(blurred.blur).toBeLessThan(sharp.blur / 10);
  });

  it("mild blur misses coverage but doesn't auto-pause; heavy blur does", () => {
    expect(blurred.blur).toBeGreaterThanOrEqual(config.autoPause.blurBelow);
    expect(heavyBlur.blur).toBeLessThan(config.autoPause.blurBelow);
  });

  it("dim room is flagged dark", () => {
    expect(qualityProblems(dim, config.quality)).toContain("dark");
  });

  it("overexposed room is flagged bright", () => {
    expect(qualityProblems(bright, config.quality)).toContain("bright");
  });
});
