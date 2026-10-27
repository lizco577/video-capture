import { analyzeFrame } from "../core/quality";
import type { QualityRequest, QualityResponse } from "./quality.worker";

export interface QualityResult {
  t: number;
  blur: number;
  brightness: number;
  /** Draw + analyse time, ms. */
  ms: number;
  inWorker: boolean;
}

/**
 * Samples the preview ~5×/s. The frame is drawn into a small canvas on the main
 * thread (a 160 px draw is cheap, and drawing a <video> into an OffscreenCanvas in
 * a worker isn't available on iOS 16.0–16.3); the Laplacian maths runs in a
 * worker. If the worker can't start, it falls back to the main thread.
 * A frame is skipped while the previous one is still being analysed.
 */
export class QualitySampler {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private worker: Worker | null = null;
  private timer: number | null = null;
  private pending: { id: number; t: number; drawMs: number } | null = null;
  private nextId = 0;
  skipped = 0;

  constructor(
    private video: HTMLVideoElement,
    private widthPx: number,
    private hz: number,
    private onResult: (r: QualityResult) => void,
  ) {
    try {
      this.worker = new Worker(new URL("./quality.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<QualityResponse>) => this.handleWorker(e.data);
      this.worker.onerror = () => this.dropWorker();
    } catch {
      this.worker = null;
    }
  }

  get usingWorker(): boolean {
    return this.worker != null;
  }

  start(): void {
    if (this.timer != null) return;
    this.timer = window.setInterval(() => this.sample(), 1000 / this.hz);
  }

  stop(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  destroy(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }

  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
  }

  private sample() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    if (this.pending) {
      this.skipped++;
      return;
    }
    const start = performance.now();
    const w = this.widthPx;
    const h = Math.max(1, Math.round((w * v.videoHeight) / v.videoWidth));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(v, 0, 0, w, h);
    const img = this.ctx.getImageData(0, 0, w, h);
    const drawMs = performance.now() - start;

    if (this.worker) {
      const id = this.nextId++;
      this.pending = { id, t: start, drawMs };
      const msg: QualityRequest = { id, width: w, height: h, pixels: img.data.buffer };
      this.worker.postMessage(msg, [img.data.buffer]);
      return;
    }
    const q = analyzeFrame(img.data, w, h);
    this.onResult({ t: start, ...q, ms: performance.now() - start, inWorker: false });
  }

  private handleWorker(r: QualityResponse) {
    if (!this.pending || r.id !== this.pending.id) return;
    const { t, drawMs } = this.pending;
    this.pending = null;
    this.onResult({ t, blur: r.blur, brightness: r.brightness, ms: drawMs + r.analyseMs, inWorker: true });
  }
}
