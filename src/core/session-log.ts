// The session log: the main output of the spike. Plain data, JSON-serialisable,
// built incrementally during capture and restored from IndexedDB after a reload.
// All `t` values are epoch milliseconds (Date.now()), so they stay comparable
// across page reloads and segments.

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screen: { width: number; height: number; dpr: number; orientationAngle: number | null };
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  standalone: boolean;
}

export interface Sample {
  t: number;
  pitch: number;
  heading: number;
  unwrapped: number;
  progress: number;
  absHeading: number | null;
  rotationRate: number;
  blur: number | null;
  brightness: number | null;
  slice: number | null;
  band: string;
  autoPaused: boolean;
  paused: boolean;
}

export interface QualitySample {
  t: number;
  blur: number;
  brightness: number;
  /** Time to compute the scores (draw + analyse), ms. */
  ms: number;
  inWorker: boolean;
}

export interface FrameStat {
  t: number;
  fps: number;
  p95FrameMs: number;
  maxFrameMs: number;
}

export interface LogEvent {
  t: number;
  type: string;
  data?: Record<string, unknown>;
}

export interface SegmentInfo {
  index: number;
  mimeType: string;
  startedAt: number;
  endedAt: number | null;
  chunks: number;
  bytes: number;
  endReason: string | null;
}

export interface SessionLog {
  schema: 1;
  sessionId: string;
  createdAt: string;
  device: DeviceInfo;
  permissions: Record<string, string>;
  codec: string | null;
  config: unknown;
  samples: Sample[];
  quality: QualitySample[];
  frames: FrameStat[];
  events: LogEvent[];
  segments: SegmentInfo[];
}

export interface SessionSummary {
  durationMs: number;
  segments: number;
  totalBytes: number;
  fps: { mean: number; min: number; secondsBelow30: number } | null;
  qualityHz: number | null;
  autoPauses: number;
  driftDeg: number | null;
}

export function createLog(sessionId: string, device: DeviceInfo, config: unknown, now = Date.now()): SessionLog {
  return {
    schema: 1,
    sessionId,
    createdAt: new Date(now).toISOString(),
    device,
    permissions: {},
    codec: null,
    config,
    samples: [],
    quality: [],
    frames: [],
    events: [],
    segments: [],
  };
}

/** Append a sample unless one was logged less than `intervalMs` ago. Mutates. Returns true if logged. */
export function addSample(log: SessionLog, s: Sample, intervalMs: number): boolean {
  const last = log.samples[log.samples.length - 1];
  if (last && s.t - last.t < intervalMs) return false;
  log.samples.push(s);
  return true;
}

export function addEvent(log: SessionLog, type: string, data?: Record<string, unknown>, t = Date.now()): LogEvent {
  const e: LogEvent = data ? { t, type, data } : { t, type };
  log.events.push(e);
  return e;
}

export function startSegment(log: SessionLog, mimeType: string, t = Date.now()): SegmentInfo {
  const seg: SegmentInfo = { index: log.segments.length, mimeType, startedAt: t, endedAt: null, chunks: 0, bytes: 0, endReason: null };
  log.segments.push(seg);
  addEvent(log, "segment-start", { index: seg.index, mimeType }, t);
  return seg;
}

export function addChunk(log: SessionLog, index: number, bytes: number): void {
  const seg = log.segments[index];
  if (!seg) return;
  seg.chunks++;
  seg.bytes += bytes;
}

export function endSegment(log: SessionLog, index: number, reason: string, t = Date.now()): void {
  const seg = log.segments[index];
  if (!seg || seg.endedAt != null) return;
  seg.endedAt = t;
  seg.endReason = reason;
  addEvent(log, "segment-end", { index, reason, chunks: seg.chunks, bytes: seg.bytes }, t);
}

/** Segments left open by a crash or reload: close them at their last known time. */
export function closeDanglingSegments(log: SessionLog, t = Date.now()): void {
  for (const seg of log.segments) if (seg.endedAt == null) endSegment(log, seg.index, "interrupted-reload", t);
}

export function summarise(log: SessionLog): SessionSummary {
  const times = [
    ...log.events.map((e) => e.t),
    ...log.samples.map((s) => s.t),
  ];
  const start = times.length ? Math.min(...times) : 0;
  const end = times.length ? Math.max(...times) : 0;

  const fps = log.frames.length
    ? {
        mean: log.frames.reduce((a, f) => a + f.fps, 0) / log.frames.length,
        min: Math.min(...log.frames.map((f) => f.fps)),
        secondsBelow30: log.frames.filter((f) => f.fps < 30).length,
      }
    : null;

  let qualityHz: number | null = null;
  if (log.quality.length > 1) {
    const span = log.quality[log.quality.length - 1].t - log.quality[0].t;
    qualityHz = span > 0 ? ((log.quality.length - 1) * 1000) / span : null;
  }

  const lapEnd = [...log.events].reverse().find((e) => e.type === "lap-complete");
  const drift = lapEnd?.data?.driftDeg;

  return {
    durationMs: end - start,
    segments: log.segments.length,
    totalBytes: log.segments.reduce((a, s) => a + s.bytes, 0),
    fps,
    qualityHz,
    autoPauses: log.events.filter((e) => e.type === "auto-pause").length,
    driftDeg: typeof drift === "number" ? drift : null,
  };
}
