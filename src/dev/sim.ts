import { eulerFor } from "../core/orientation";
import { wrap180 } from "../core/angles";
import type { SensorSource } from "../platform/sensors";

// Desktop simulator, enabled with ?sim=1. It replaces the camera with a canvas
// showing a fake room and replaces the motion sensors with a scripted "person".
// Used to exercise the full flow on a laptop; phones never load it unless the
// URL asks for it. Drive it from the on-screen panel or from the console:
//   __sim.set({ pitch: 30, heading: 45 })   __sim.shake(true)   await __sim.autoLap()

export function simEnabled(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("sim");
}

interface SimState {
  pitch: number;
  /** True heading (what a perfect compass would read). */
  heading: number;
  /** Total true turn since start, unwrapped. */
  turned: number;
  rate: number;
  shaking: boolean;
  dim: boolean;
  /** Gyro drift as a fraction of total turn (0.02 = 2%). */
  driftPerDeg: number;
  running: boolean;
}

export const simState: SimState = {
  pitch: 0,
  heading: 0,
  turned: 0,
  rate: 0,
  shaking: false,
  dim: false,
  driftPerDeg: 0.015,
  running: false,
};

const listeners = new Set<() => void>();
export function onSimChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

function setPose(pitch: number, heading: number, rate: number) {
  simState.turned += wrap180(heading - simState.heading);
  simState.pitch = Math.max(-89, Math.min(89, pitch));
  simState.heading = wrap180(heading);
  simState.rate = rate;
  changed();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Turn smoothly to a pose at a given angular speed (deg/s). */
async function moveTo(pitch: number, headingUnwrapped: number, speedDegPerSec = 50) {
  const startPitch = simState.pitch;
  const startTurn = simState.turned;
  const dP = pitch - startPitch;
  const dH = headingUnwrapped - startTurn;
  const dist = Math.hypot(dP, dH);
  const ms = Math.max(16, (dist / speedDegPerSec) * 1000);
  const t0 = performance.now();
  for (;;) {
    const k = Math.min(1, (performance.now() - t0) / ms);
    const turnNow = startTurn + dH * k;
    setPose(startPitch + dP * k, simState.heading + wrap180(turnNow - simState.turned), k < 1 ? speedDegPerSec : 0);
    if (k >= 1) break;
    await sleep(16);
  }
}

async function hold(ms: number) {
  simState.rate = 0;
  await sleep(ms);
}

export interface AutoLapOptions {
  /** Cells to look past without dwelling, to leave gaps, e.g. [[3, "floor"]]. */
  leaveGaps?: [number, "ceiling" | "walls" | "floor"][];
  holdMs?: number;
  /** Walk counter-clockwise instead. */
  reverse?: boolean;
}

/** A scripted careful lap: ceiling, walls, floor in each slice, then step on. */
async function autoLap(o: AutoLapOptions = {}) {
  if (simState.running) return;
  simState.running = true;
  const holdMs = o.holdMs ?? 1000;
  const dir = o.reverse ? -1 : 1;
  const start = simState.turned;
  try {
    for (let slice = 0; slice < 12 && simState.running; slice++) {
      const heading = start + dir * slice * 30;
      for (const [band, pitch] of [
        ["ceiling", 45],
        ["walls", 0],
        ["floor", -45],
      ] as const) {
        const skip = o.leaveGaps?.some(([s, b]) => s === slice && b === band);
        if (skip) continue;
        await moveTo(pitch, heading);
        await hold(holdMs);
      }
      await moveTo(0, heading);
    }
    if (simState.running) {
      await moveTo(0, start + dir * 360);
      await hold(500);
    }
  } finally {
    simState.running = false;
    changed();
  }
}

/** After the lap, point at a cell (for the gap flow). */
async function lookAt(slice: number, band: "ceiling" | "walls" | "floor", holdMs = 1000) {
  const pitch = { ceiling: 45, walls: 0, floor: -45 }[band];
  const target = Math.round(simState.turned / 360) * 360 + slice * 30;
  // Turn the short way.
  const nearest = simState.turned + wrap180(target - simState.turned);
  await moveTo(pitch, nearest);
  await hold(holdMs);
}

function stop() {
  simState.running = false;
}

const api = {
  state: simState,
  set(p: { pitch?: number; heading?: number }) {
    setPose(p.pitch ?? simState.pitch, p.heading ?? simState.heading, 0);
  },
  shake(on: boolean) {
    simState.shaking = on;
    changed();
  },
  dim(on: boolean) {
    simState.dim = on;
    changed();
  },
  autoLap,
  lookAt,
  moveTo,
  stop,
};

if (simEnabled()) (window as unknown as { __sim: typeof api }).__sim = api;
export const sim = api;

/** Gyro view of the world: true heading plus a slow drift proportional to turn. */
function gyroHeading() {
  return simState.heading + simState.turned * simState.driftPerDeg;
}

export const simSensorSource: SensorSource = {
  start(h) {
    const id = window.setInterval(() => {
      const t = performance.now();
      h.onOrientation(eulerFor(simState.pitch, gyroHeading()), t);
      h.onAbsoluteHeading(((simState.heading % 360) + 360) % 360, t);
      h.onMotion(simState.shaking ? 220 : simState.rate, t);
    }, 16);
    return () => window.clearInterval(id);
  },
};

// ---- Fake camera ---------------------------------------------------------

const PX_PER_DEG = 6;
let panorama: HTMLCanvasElement | null = null;

/** Equirectangular "room": textured ceiling, walls with doors and pictures, floorboards. */
function buildPanorama(): HTMLCanvasElement {
  const w = 360 * PX_PER_DEG;
  const h = 180 * PX_PER_DEG;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const yForPitch = (p: number) => (90 - p) * PX_PER_DEG;
  // Ceiling, walls, floor.
  ctx.fillStyle = "#e8e6e1";
  ctx.fillRect(0, 0, w, yForPitch(25));
  ctx.fillStyle = "#d9cdb8";
  ctx.fillRect(0, yForPitch(25), w, yForPitch(-20) - yForPitch(25));
  ctx.fillStyle = "#8a6a4a";
  ctx.fillRect(0, yForPitch(-20), w, h - yForPitch(-20));
  // Floorboards.
  ctx.strokeStyle = "#6e5338";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, yForPitch(-20));
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // Ceiling light fittings and cornice.
  ctx.fillStyle = "#c9c4ba";
  ctx.fillRect(0, yForPitch(27), w, 6);
  for (let deg = 15; deg < 360; deg += 60) {
    ctx.beginPath();
    ctx.arc(deg * PX_PER_DEG, yForPitch(55), 22, 0, Math.PI * 2);
    ctx.fill();
  }
  // Doors, windows, pictures.
  for (let deg = 0; deg < 360; deg += 30) {
    const x = deg * PX_PER_DEG;
    ctx.fillStyle = deg % 90 === 0 ? "#7a5634" : "#4d6b8a";
    ctx.fillRect(x + 30, yForPitch(18), 70, deg % 90 === 0 ? 220 : 80);
    ctx.fillStyle = "#2b2b2b";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText(String(deg / 30), x + 50, yForPitch(-5));
  }
  // Skirting.
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, yForPitch(-18), w, 10);
  // Fine texture so the blur score behaves like a real scene.
  const img = ctx.getImageData(0, 0, w, h);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 24) - 128) / 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function simCameraStream(): MediaStream {
  panorama ??= buildPanorama();
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  const hFov = 45;
  const vFov = 60;
  const draw = () => {
    const pano = panorama!;
    const sw = hFov * PX_PER_DEG;
    const sh = vFov * PX_PER_DEG;
    let sx = (((simState.heading - hFov / 2) % 360) + 360) % 360 * PX_PER_DEG;
    const sy = Math.max(0, Math.min(pano.height - sh, (90 - simState.pitch - vFov / 2) * PX_PER_DEG));
    ctx.filter = simState.shaking ? "blur(10px)" : "none";
    const first = Math.min(sw, pano.width - sx);
    ctx.drawImage(pano, sx, sy, first, sh, 0, 0, (first / sw) * canvas.width, canvas.height);
    if (first < sw) {
      sx = 0;
      ctx.drawImage(pano, 0, sy, sw - first, sh, (first / sw) * canvas.width, 0, ((sw - first) / sw) * canvas.width, canvas.height);
    }
    ctx.filter = "none";
    if (simState.dim) {
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };
  draw();
  window.setInterval(draw, 33);
  return canvas.captureStream(30);
}
