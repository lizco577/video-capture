import { describe, expect, it } from "vitest";
import {
  addChunk,
  addEvent,
  addSample,
  closeDanglingSegments,
  createLog,
  endSegment,
  startSegment,
  summarise,
  type DeviceInfo,
  type Sample,
} from "./session-log";

const device: DeviceInfo = {
  userAgent: "test",
  platform: "test",
  language: "en",
  screen: { width: 393, height: 852, dpr: 3, orientationAngle: 0 },
  hardwareConcurrency: 6,
  deviceMemoryGb: null,
  standalone: false,
};

const sample = (t: number): Sample => ({
  t,
  pitch: 0,
  heading: 0,
  unwrapped: 0,
  progress: 0,
  absHeading: null,
  rotationRate: 0,
  blur: 100,
  brightness: 120,
  slice: 0,
  band: "walls",
  autoPaused: false,
  paused: false,
});

describe("session log", () => {
  it("throttles samples", () => {
    const log = createLog("s1", device, {}, 0);
    expect(addSample(log, sample(1000), 100)).toBe(true);
    expect(addSample(log, sample(1050), 100)).toBe(false);
    expect(addSample(log, sample(1100), 100)).toBe(true);
    expect(log.samples.map((s) => s.t)).toEqual([1000, 1100]);
  });

  it("tracks segments and closes dangling ones after a reload", () => {
    const log = createLog("s1", device, {}, 0);
    startSegment(log, "video/mp4", 1000);
    addChunk(log, 0, 500);
    addChunk(log, 0, 700);
    endSegment(log, 0, "pause", 5000);
    startSegment(log, "video/mp4", 8000);
    addChunk(log, 1, 300);
    closeDanglingSegments(log, 9000);
    expect(log.segments).toEqual([
      { index: 0, mimeType: "video/mp4", startedAt: 1000, endedAt: 5000, chunks: 2, bytes: 1200, endReason: "pause" },
      { index: 1, mimeType: "video/mp4", startedAt: 8000, endedAt: 9000, chunks: 1, bytes: 300, endReason: "interrupted-reload" },
    ]);
    expect(log.events.map((e) => e.type)).toEqual(["segment-start", "segment-end", "segment-start", "segment-end"]);
  });

  it("summarises fps, sampler rate, auto-pauses and drift", () => {
    const log = createLog("s1", device, {}, 0);
    log.frames.push({ t: 1000, fps: 58, p95FrameMs: 20, maxFrameMs: 30 }, { t: 2000, fps: 28, p95FrameMs: 40, maxFrameMs: 80 });
    for (let i = 0; i <= 10; i++) log.quality.push({ t: 1000 + i * 200, blur: 1, brightness: 1, ms: 2, inWorker: true });
    addEvent(log, "auto-pause", { reason: "rotation" }, 1500);
    addEvent(log, "lap-complete", { driftDeg: -6.5 }, 3000);
    addSample(log, sample(1000), 100);
    const s = summarise(log);
    expect(s.fps).toEqual({ mean: 43, min: 28, secondsBelow30: 1 });
    expect(s.qualityHz).toBeCloseTo(5);
    expect(s.autoPauses).toBe(1);
    expect(s.driftDeg).toBe(-6.5);
    expect(s.durationMs).toBe(2000);
  });
});
