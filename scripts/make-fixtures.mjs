// Generates the small PNG fixtures used by src/core/quality.test.ts.
// Deterministic (seeded), so the files only change if this script changes.
// Run: npm run fixtures
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 160;
const H = 120;
const out = new URL("../src/core/__fixtures__/", import.meta.url);
mkdirSync(out, { recursive: true });

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// A "room-like" scene: a wall, a skirting line, a picture frame, a door edge and a little texture.
function scene() {
  const px = new Float32Array(W * H * 3);
  const set = (x, y, r, g, b) => {
    const i = (y * W + x) * 3;
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let [r, g, b] = y > 92 ? [150, 120, 90] : [205, 200, 190];
      if (y === 92 || y === 93) [r, g, b] = [60, 50, 40];
      if (x > 30 && x < 70 && y > 20 && y < 60) [r, g, b] = (x < 33 || x > 67 || y < 23 || y > 57) ? [40, 40, 45] : [90, 130, 170];
      if (x > 120 && x < 126) [r, g, b] = [120, 90, 60];
      const n = (rand() - 0.5) * 24;
      set(x, y, r + n, g + n, b + n);
    }
  return px;
}

function boxBlur(px, radius) {
  const outPx = new Float32Array(px.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(W - 1, Math.max(0, x + dx));
            const yy = Math.min(H - 1, Math.max(0, y + dy));
            s += px[(yy * W + xx) * 3 + c]; n++;
          }
        outPx[(y * W + x) * 3 + c] = s / n;
      }
  return outPx;
}

function scale(px, k, add = 0) {
  return px.map((v) => v * k + add);
}

function write(name, px) {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) png.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(px[i * 3 + c])));
    png.data[i * 4 + 3] = 255;
  }
  writeFileSync(new URL(name, out), PNG.sync.write(png));
}

const sharp = scene();
write("room-sharp.png", sharp);
write("room-motion-blur.png", boxBlur(sharp, 3));
write("room-heavy-blur.png", boxBlur(sharp, 7));
write("room-dim.png", scale(sharp, 0.12));
write("room-overexposed.png", scale(sharp, 0.4, 170));
console.log("fixtures written");
