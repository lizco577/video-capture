// Frame quality scores on a small RGBA buffer (ImageData-shaped).
//   blur:       variance of the 4-neighbour Laplacian of the greyscale image.
//               Higher is sharper. Depends on scene texture and buffer size, so
//               thresholds are set for the 160 px-wide sample (config.quality).
//   brightness: mean greyscale value, 0–255.

export interface QualityScores {
  blur: number;
  brightness: number;
}

export interface QualityThresholds {
  blurMin: number;
  brightnessMin: number;
  brightnessMax: number;
}

export function toGrey(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
    grey[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return grey;
}

export function laplacianVariance(grey: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap = grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] - 4 * grey[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function meanBrightness(grey: Float32Array): number {
  if (grey.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  return sum / grey.length;
}

export function analyzeFrame(rgba: ArrayLike<number>, width: number, height: number): QualityScores {
  const grey = toGrey(rgba, width, height);
  return { blur: laplacianVariance(grey, width, height), brightness: meanBrightness(grey) };
}

export type QualityProblem = "blurry" | "dark" | "bright";

export function qualityProblems(q: QualityScores, t: QualityThresholds): QualityProblem[] {
  const problems: QualityProblem[] = [];
  if (q.blur < t.blurMin) problems.push("blurry");
  if (q.brightness < t.brightnessMin) problems.push("dark");
  if (q.brightness > t.brightnessMax) problems.push("bright");
  return problems;
}

export function frameIsGood(q: QualityScores, t: QualityThresholds): boolean {
  return qualityProblems(q, t).length === 0;
}
