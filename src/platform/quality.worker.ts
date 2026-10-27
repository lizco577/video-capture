/// <reference lib="webworker" />
import { analyzeFrame } from "../core/quality";

export interface QualityRequest {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
}

export interface QualityResponse {
  id: number;
  blur: number;
  brightness: number;
  analyseMs: number;
}

self.onmessage = (e: MessageEvent<QualityRequest>) => {
  const { id, width, height, pixels } = e.data;
  const start = performance.now();
  const q = analyzeFrame(new Uint8ClampedArray(pixels), width, height);
  const res: QualityResponse = { id, ...q, analyseMs: performance.now() - start };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
};
