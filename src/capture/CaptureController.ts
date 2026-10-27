import { config } from "../config";
import {
  type Band,
  type CellChange,
  type CellState,
  type CoverageState,
  bandForPitch,
  cellState,
  counts,
  gaps,
  initialCoverage,
  progressFraction,
  progressWords,
  skipCell,
  stepCoverage,
} from "../core/coverage";
import { type LapState, currentSlice, initialLap, progressOf, updateLap } from "../core/lap";
import {
  type OrientationState,
  anchorHere,
  applyHeadingCorrection,
  headingDrift,
  initialOrientation,
  reanchorTo,
  updateOrientation,
} from "../core/orientation";
import {
  type Target,
  deltaToTarget,
  dotPosition,
  gapInstruction,
  lapInstruction,
  lapTarget,
  nearestGap,
} from "../core/guidance";
import { frameIsGood } from "../core/quality";
import {
  type Point,
  arrowAngleDeg,
  blendPosition,
  dwellProgress,
  inHoldZone,
  isTargetCell,
  suspendDwell,
  targetKey,
  zoneRadiusPx,
} from "../core/dot";
import {
  type SessionLog,
  addChunk,
  addEvent,
  addSample,
  closeDanglingSegments,
  createLog,
  endSegment,
  startSegment,
} from "../core/session-log";
import { deviceInfo, requestWakeLock, screenAngle } from "../platform/device";
import { pickMimeType, SegmentRecorder } from "../platform/recorder";
import { QualitySampler, type QualityResult } from "../platform/quality-sampler";
import { sensorSource } from "../platform/sensors";
import { Speaker } from "../platform/speech";
import { type Phase, type SavedSession, saveSession } from "../platform/store";

// Runs one capture session. Holds the live state outside React: sensors fire at
// ~60 Hz and the dot moves every frame, so the controller updates the dot element
// directly and only notifies React when something visible in words or in the
// ring changes.

export type Status = "recording" | "waiting" | "paused";
export type PauseReason = "user" | "interrupted" | "restored" | "exit";

export const AUTO_PAUSE_TEXT = "Slow down a little. Nothing is wrong. We waited so the video stays sharp.";
export const PAUSED_TEXT = "Recording paused. Everything so far is saved. Go back to where you stopped, then tap Resume.";
const NO_SENSOR_TEXT = "We can't read your phone's motion sensor. Close this page and open the link again in Safari or Chrome.";

export interface CaptureView {
  phase: Phase;
  status: Status;
  pauseReason: PauseReason | null;
  autoPaused: boolean;
  instruction: string;
  cells: CellState[];
  slices: number;
  /** Slice the ring highlights: the one guidance is working on. */
  highlightSlice: number;
  activeBand: Band;
  progressWords: string;
  counts: Record<CellState, number>;
  gapsLeft: number;
  muted: boolean;
  sensorProblem: boolean;
  recordingError: string | null;
}

export interface LiveStats {
  fps: number;
  qualityHz: number;
  pitch: number;
  heading: number;
  unwrapped: number;
  progress: number;
  absHeading: number | null;
  rotationRate: number;
  blur: number | null;
  brightness: number | null;
  cell: string;
  driftDeg: number | null;
  codec: string | null;
  segment: number;
  bytes: number;
  qualityInWorker: boolean;
  qualityMs: number | null;
  direction: number | null;
}

export interface StartOptions {
  sessionId: string;
  stream: MediaStream;
  video: HTMLVideoElement;
  permissions: Record<string, string>;
  restore?: SavedSession;
  /** Re-acquire the camera when the old stream ended (after the app was backgrounded). */
  reacquireCamera: () => Promise<MediaStream>;
}

export class CaptureController {
  readonly sessionId: string;
  private stream: MediaStream;
  private video: HTMLVideoElement;
  private log: SessionLog;
  private orientation: OrientationState = initialOrientation();
  private coverage: CoverageState;
  private lap: LapState;
  private phase: Phase;
  private paused = false;
  private pauseReason: PauseReason | null = null;
  private autoPaused = false;
  private lastUnstableAt = -Infinity;
  private rotationRate = 0;
  private absHeading: number | null = null;
  private absAtAnchor: number | null = null;
  private quality: QualityResult | null = null;
  private qualityTimes: number[] = [];
  private anchored = false;
  private needsReanchorTo: number | null = null;
  private firstSensorAt: number | null = null;
  private sensorProblem = false;
  private recorder: SegmentRecorder | null = null;
  private segmentIndex = -1;
  private codec: string | null;
  private recordingError: string | null = null;
  private sampler: QualitySampler;
  private stopSensors: (() => void) | null = null;
  private speaker = new Speaker(config.guidance.minSpeechIntervalMs);
  private raf: number | null = null;
  private frameTimes: number[] = [];
  private lastFrameAt: number | null = null;
  private frameWindowStart = 0;
  private fps = 0;
  private lastPersist = 0;
  private dotEl: HTMLElement | null = null;
  private targetEl: HTMLElement | null = null;
  private view: CaptureView;
  private listeners = new Set<() => void>();
  private wakeLock: { release(): Promise<void> } | null = null;
  private startedAt = performance.now();
  private reacquireCamera: () => Promise<MediaStream>;
  private destroyed = false;
  private lastInstruction = "";
  private doneStarted = false;
  // Blue-dot presentation state (see core/dot.ts).
  private dotShown: Point = { x: 0, y: 0 };
  private dotKey = "none";
  private glide: { from: Point; start: number } | null = null;
  private inZone = false;
  /** Unwrapped heading when the person paused: "where you stopped". */
  private pausedAtUnwrapped: number | null = null;
  private resolveFinished!: () => void;
  /** Resolves once the lap is done, the last segment is flushed and the session saved. */
  readonly finished: Promise<void> = new Promise((r) => (this.resolveFinished = r));

  constructor(o: StartOptions) {
    this.sessionId = o.sessionId;
    this.stream = o.stream;
    this.video = o.video;
    this.reacquireCamera = o.reacquireCamera;
    this.codec = pickMimeType(config.recording.mimeTypes);

    if (o.restore) {
      this.log = o.restore.log;
      closeDanglingSegments(this.log);
      this.coverage = { ...initialCoverage(config.coverage.slices), cells: o.restore.cells.slice() };
      this.lap = o.restore.lap;
      this.phase = o.restore.phase;
      this.speaker.setMuted(o.restore.muted);
      this.segmentIndex = this.log.segments.length - 1;
      // After a reload the sensor's zero has moved: the person goes back to where they
      // stopped, and on Resume that direction becomes the saved heading.
      this.needsReanchorTo = o.restore.unwrapped;
      this.pausedAtUnwrapped = o.restore.unwrapped;
      this.paused = true;
      this.pauseReason = "restored";
      addEvent(this.log, "session-restored", { unwrapped: o.restore.unwrapped, phase: o.restore.phase });
    } else {
      this.log = createLog(o.sessionId, deviceInfo(), config);
      this.coverage = initialCoverage(config.coverage.slices);
      this.lap = initialLap();
      this.phase = "lap";
    }
    this.log.permissions = { ...this.log.permissions, ...o.permissions };
    this.log.codec = this.codec;
    addEvent(this.log, "capture-start", {
      codec: this.codec,
      track: trackInfo(this.stream),
      restored: !!o.restore,
      dot: { ...config.guidance.dot },
    });

    this.sampler = new QualitySampler(this.video, config.quality.sampleWidthPx, config.quality.sampleHz, (q) =>
      this.onQuality(q),
    );
    this.view = this.computeView();
  }

  // ---- lifecycle ---------------------------------------------------------

  start(): void {
    this.stopSensors = sensorSource().start({
      onOrientation: (r, t) => {
        this.firstSensorAt ??= t;
        this.orientation = updateOrientation(this.orientation, r, t, config.orientation);
        if (!this.anchored && !this.paused) {
          this.orientation = anchorHere(this.orientation);
          this.anchored = true;
          this.absAtAnchor = this.absHeading;
          addEvent(this.log, "anchor", { heading: this.orientation.heading, absHeading: this.absHeading });
        }
        this.step(t);
      },
      onAbsoluteHeading: (deg) => {
        this.absHeading = deg;
        if (this.anchored && this.absAtAnchor == null) this.absAtAnchor = deg;
      },
      onMotion: (rate) => {
        this.rotationRate = rate;
      },
    });
    this.sampler.start();
    if (!this.paused) this.startSegment();
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    void requestWakeLock().then((wl) => (this.wakeLock = wl));
    this.raf = requestAnimationFrame(this.tick);
    this.notify();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.stopSensors?.();
    this.sampler.destroy();
    this.speaker.cancel();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    await this.stopSegment("destroy");
    await this.persist();
    void this.wakeLock?.release().catch(() => undefined);
  }

  // ---- public actions ----------------------------------------------------

  setDotElements(dot: HTMLElement | null, target: HTMLElement | null): void {
    this.dotEl = dot;
    this.targetEl = target;
  }

  /** Call from the first tap so iOS lets us speak. */
  unlockSpeech(): void {
    this.speaker.unlock();
  }

  setMuted(muted: boolean): void {
    this.speaker.setMuted(muted);
    addEvent(this.log, muted ? "voice-muted" : "voice-unmuted");
    this.refresh();
  }

  async pause(reason: PauseReason): Promise<void> {
    if (this.phase === "done") return;
    if (this.paused) {
      if (reason === "interrupted" || reason === "exit") {
        this.pauseReason = reason;
        this.refresh();
      }
      return;
    }
    this.paused = true;
    this.pauseReason = reason;
    this.pausedAtUnwrapped = this.orientation.unwrapped;
    this.coverage = { ...this.coverage, dwell: null };
    addEvent(this.log, "pause", { reason });
    this.speaker.cancel();
    this.refresh();
    await this.stopSegment(reason);
    await this.persist();
  }

  async resume(): Promise<void> {
    if (!this.paused || this.phase === "done") return;
    if (this.stream.getVideoTracks().every((t) => t.readyState === "ended")) {
      try {
        this.stream = await this.reacquireCamera();
        this.video.srcObject = this.stream;
        await this.video.play().catch(() => undefined);
        addEvent(this.log, "camera-reacquired", { track: trackInfo(this.stream) });
      } catch (e) {
        addEvent(this.log, "camera-reacquire-failed", { error: String(e) });
      }
    }
    if (this.needsReanchorTo != null) {
      if (!this.anchored) {
        this.anchored = true;
        this.absAtAnchor = this.absHeading;
      }
      this.orientation = reanchorTo(this.orientation, this.needsReanchorTo);
      addEvent(this.log, "reanchor", { reason: "restore", unwrapped: this.needsReanchorTo });
      this.needsReanchorTo = null;
    }
    this.paused = false;
    this.pauseReason = null;
    this.pausedAtUnwrapped = null;
    addEvent(this.log, "resume", { unwrapped: round(this.orientation.unwrapped, 1) });
    this.startSegment();
    void requestWakeLock().then((wl) => (this.wakeLock = wl));
    this.lastInstruction = "";
    this.refresh();
  }

  /** "Something in the way?": skip the floor of the current slice (or the targeted gap after the lap). */
  skipHere(): void {
    const t = performance.now();
    let slice = this.lap.guideSlice;
    let band: Band = "floor";
    if (this.phase === "gaps") {
      const target = this.currentTarget();
      if (target?.kind === "band") {
        slice = target.slice;
        band = target.band;
      }
    }
    const r = skipCell(this.coverage, slice, band, t);
    this.coverage = r.state;
    this.logChanges(r.changes);
    this.refresh();
  }

  /** Stop recording and save, to be continued later from the same link. */
  async finishLater(): Promise<void> {
    await this.pause("exit");
    addEvent(this.log, "finish-later");
    await this.persist();
  }

  getView(): CaptureView {
    return this.view;
  }

  getLog(): SessionLog {
    return this.log;
  }

  getCells(): CellState[] {
    return this.coverage.cells;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getLive(): LiveStats {
    const q = this.quality;
    const slice = currentSlice(this.lap, this.orientation.unwrapped, this.coverage.slices);
    const band = bandForPitch(this.orientation.pitch, config.bands);
    const now = performance.now();
    const recent = this.qualityTimes.filter((t) => now - t < 2000);
    return {
      fps: this.fps,
      qualityHz: recent.length / 2,
      pitch: this.orientation.pitch,
      heading: this.orientation.heading,
      unwrapped: this.orientation.unwrapped,
      progress: progressOf(this.orientation.unwrapped, this.lap.direction),
      absHeading: this.absHeading,
      rotationRate: this.rotationRate,
      blur: q?.blur ?? null,
      brightness: q?.brightness ?? null,
      cell: slice == null ? `– / ${band}` : `${slice} / ${band}`,
      driftDeg: this.driftNow(),
      codec: this.codec,
      segment: this.segmentIndex,
      bytes: this.log.segments.reduce((a, s) => a + s.bytes, 0),
      qualityInWorker: this.sampler.usingWorker,
      qualityMs: q?.ms ?? null,
      direction: this.lap.direction,
    };
  }

  // ---- internals -----------------------------------------------------------

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      addEvent(this.log, "visibility-hidden");
      void this.pause("interrupted");
    } else {
      addEvent(this.log, "visibility-visible");
    }
  };

  private onPageHide = () => {
    addEvent(this.log, "pagehide");
    void this.pause("interrupted");
  };

  private startSegment() {
    if (!this.codec) {
      this.recordingError = "This browser can't record video.";
      addEvent(this.log, "recording-unsupported");
      return;
    }
    const seg = startSegment(this.log, this.codec);
    this.segmentIndex = seg.index;
    try {
      this.recorder = new SegmentRecorder({
        sessionId: this.sessionId,
        segment: seg.index,
        stream: this.stream,
        mimeType: this.codec,
        timesliceMs: config.recording.timesliceMs,
        videoBitsPerSecond: config.recording.videoBitsPerSecond,
        onChunk: (bytes) => addChunk(this.log, seg.index, bytes),
        onError: (message) => {
          this.recordingError = message;
          addEvent(this.log, "recording-error", { segment: seg.index, message });
          this.refresh();
        },
      });
      this.recorder.start();
    } catch (e) {
      this.recordingError = String(e);
      addEvent(this.log, "recording-error", { segment: seg.index, message: String(e) });
      endSegment(this.log, seg.index, "failed-to-start");
      this.recorder = null;
    }
  }

  private async stopSegment(reason: string) {
    const rec = this.recorder;
    if (!rec) return;
    this.recorder = null;
    await rec.stop();
    endSegment(this.log, this.segmentIndex, reason);
  }

  private onQuality(q: QualityResult) {
    this.quality = q;
    this.qualityTimes.push(q.t);
    if (this.qualityTimes.length > 30) this.qualityTimes.shift();
    this.log.quality.push({
      t: Date.now(),
      blur: round(q.blur, 1),
      brightness: round(q.brightness, 1),
      ms: round(q.ms, 2),
      inWorker: q.inWorker,
    });
  }

  private qualityFresh(now: number): boolean {
    return !!this.quality && now - this.quality.t <= config.quality.staleMs;
  }

  private tick = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    this.trackFrame(now);

    if (this.firstSensorAt == null && now - this.startedAt > 2500 && !this.sensorProblem) {
      this.sensorProblem = true;
      addEvent(this.log, "no-orientation-events");
    } else if (this.firstSensorAt != null && this.sensorProblem) {
      this.sensorProblem = false;
    }

    this.placeDot(now);
    this.logSample();
    if (now - this.lastPersist > config.logging.persistIntervalMs) {
      this.lastPersist = now;
      void this.persist();
    }
    this.refresh();
  };

  /**
   * Advance the model (auto-pause, lap, coverage, phase). Runs on every orientation
   * reading rather than on animation frames, so coverage keeps working even when the
   * UI frame rate drops or the browser throttles rendering.
   */
  private step(now: number) {
    this.updateAutoPause(now);

    if (this.anchored && !this.paused) {
      const unwrapped = this.orientation.unwrapped;
      const prevLap = this.lap;
      this.lap = updateLap(this.lap, unwrapped, {
        slices: this.coverage.slices,
        lapDirectionThresholdDeg: config.orientation.lapDirectionThresholdDeg,
        lapCompleteDeg: config.orientation.lapCompleteDeg,
      });
      if (this.lap.direction !== prevLap.direction) addEvent(this.log, "lap-direction", { direction: this.lap.direction });

      const qualityGood =
        this.qualityFresh(now) &&
        frameIsGood(this.quality!, config.quality) &&
        this.rotationRate <= config.motion.maxRotationRateDegPerSec;
      const slice = currentSlice(this.lap, unwrapped, this.coverage.slices);
      const band = bandForPitch(this.orientation.pitch, config.bands);
      const target = this.currentTarget();
      this.inZone =
        !!target && inHoldZone(deltaToTarget(target, this.lap, unwrapped, this.orientation.pitch), config.guidance.dot.holdZoneDeg);
      const suspended = suspendDwell(isTargetCell(target, { slice, band }), this.inZone, config.guidance.dot);
      const r = stepCoverage(
        this.coverage,
        { t: now, slice, band, good: qualityGood, frozen: this.autoPaused || suspended },
        config.coverage.dwellMs,
      );
      this.coverage = r.state;
      this.logChanges(r.changes);

      if (this.phase === "lap" && this.lap.complete) this.onLapComplete();
      if (this.phase === "gaps" && gaps(this.coverage).length === 0) void this.onDone();
    }

    this.refresh();
  }

  private trackFrame(now: number) {
    if (this.lastFrameAt != null) this.frameTimes.push(now - this.lastFrameAt);
    this.lastFrameAt = now;
    if (now - this.frameWindowStart >= 1000) {
      const times = this.frameTimes;
      if (times.length) {
        const sorted = times.slice().sort((a, b) => a - b);
        this.fps = (times.length * 1000) / (now - this.frameWindowStart);
        if (this.frameWindowStart > 0) {
          this.log.frames.push({
            t: Date.now(),
            fps: round(this.fps, 1),
            p95FrameMs: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0, 1),
            maxFrameMs: round(sorted[sorted.length - 1] ?? 0, 1),
          });
        }
      }
      this.frameTimes = [];
      this.frameWindowStart = now;
    }
  }

  private updateAutoPause(now: number) {
    if (this.paused || this.phase === "done") {
      this.autoPaused = false;
      return;
    }
    const tooFast = this.rotationRate > config.autoPause.rotationRateDegPerSec;
    const tooBlurry = this.qualityFresh(now) && this.quality!.blur < config.autoPause.blurBelow;
    if (tooFast || tooBlurry) {
      this.lastUnstableAt = now;
      if (!this.autoPaused) {
        this.autoPaused = true;
        addEvent(this.log, "auto-pause", {
          reason: tooFast ? "rotation" : "blur",
          rotationRate: round(this.rotationRate, 1),
          blur: this.quality ? round(this.quality.blur, 1) : null,
        });
        this.speaker.say(AUTO_PAUSE_TEXT, true);
      }
    } else if (this.autoPaused && now - this.lastUnstableAt >= config.autoPause.resumeAfterStableMs) {
      this.autoPaused = false;
      addEvent(this.log, "auto-resume", { afterMs: Math.round(now - this.lastUnstableAt) });
      this.lastInstruction = "";
    }
  }

  private onLapComplete() {
    const drift = this.driftNow();
    addEvent(this.log, "lap-complete", {
      unwrapped: round(this.orientation.unwrapped, 1),
      progress: round(progressOf(this.orientation.unwrapped, this.lap.direction), 1),
      absAtStart: this.absAtAnchor,
      absNow: this.absHeading,
      driftDeg: drift == null ? null : round(drift, 1),
      gaps: gaps(this.coverage).length,
    });
    // Re-anchor: if the compass is available and agrees roughly, remove the gyro drift
    // before guiding the person to gaps.
    if (drift != null && Math.abs(drift) <= config.orientation.maxCompassReanchorDeg) {
      this.orientation = applyHeadingCorrection(this.orientation, -drift);
      addEvent(this.log, "reanchor", { reason: "lap-end-compass", correctionDeg: round(-drift, 1) });
    } else {
      addEvent(this.log, "reanchor-skipped", { reason: drift == null ? "no-compass" : "drift-too-large" });
    }
    this.phase = gaps(this.coverage).length ? "gaps" : "done";
    this.lastInstruction = "";
    if (this.phase === "done") void this.onDone();
  }

  private async onDone() {
    if (this.doneStarted) return;
    this.doneStarted = true;
    this.phase = "done";
    const c = counts(this.coverage);
    addEvent(this.log, "room-captured", { ...c });
    this.speaker.say("Room captured.", true);
    this.refresh();
    await this.stopSegment("complete");
    this.sampler.stop();
    await this.persist("finished");
    this.notify();
    this.resolveFinished();
  }

  private driftNow(): number | null {
    if (!this.anchored) return null;
    return headingDrift(0, this.orientation.unwrapped, this.absAtAnchor, this.absHeading);
  }

  private currentTarget(): Target | null {
    if (this.phase === "lap") return lapTarget(this.coverage, this.lap, config.guidance);
    if (this.phase === "gaps")
      return nearestGap(this.coverage, this.lap, this.orientation.unwrapped, this.orientation.pitch, config.guidance);
    return null;
  }

  private placeDot(now: number) {
    const dot = this.dotEl;
    if (!dot) return;
    const opts = config.guidance.dot;
    const target = this.currentTarget();
    if (!target || this.paused || !this.anchored) {
      dot.style.opacity = "0";
      this.targetEl?.style.setProperty("--fill", "0");
      this.dotKey = "none";
      return;
    }
    const d = deltaToTarget(target, this.lap, this.orientation.unwrapped, this.orientation.pitch);
    const p = dotPosition(
      d,
      { width: window.innerWidth, height: window.innerHeight, marginPx: 32, topPx: 190, bottomPx: 290 },
      config.guidance,
      screenAngle(),
    );

    // Smooth move: when the target changes, glide from where the dot was shown.
    const key = targetKey(target);
    if (key !== this.dotKey) {
      this.glide = opts.smoothMove && this.dotKey !== "none" ? { from: this.dotShown, start: now } : null;
      this.dotKey = key;
    }
    let shown: Point = { x: p.x, y: p.y };
    if (this.glide) {
      const b = blendPosition(this.glide.from, shown, now - this.glide.start, opts.moveMs);
      shown = { x: b.x, y: b.y };
      if (b.done) this.glide = null;
    }
    this.dotShown = shown;

    dot.style.opacity = this.autoPaused ? "0.4" : "1";
    dot.style.transform = `translate(-50%, -50%) translate(${shown.x.toFixed(1)}px, ${shown.y.toFixed(1)}px)`;
    dot.dataset.aligned = String(p.aligned);

    // Edge arrow: shown instead of the dot while the target is off screen.
    // Never while inside the hold zone: then the person is on target even if the dot is clamped.
    dot.dataset.arrow = String(opts.edgeArrow && !p.onScreen && !this.glide && !(opts.holdZone && this.inZone));
    dot.style.setProperty("--arrow-angle", `${arrowAngleDeg(p).toFixed(1)}deg`);

    // Hold zone: a ring round the dot; the target cell only counts inside it.
    const showZone = opts.holdZone && target.kind === "band" && (p.onScreen || this.inZone);
    dot.dataset.zone = String(showZone);
    dot.dataset.inZone = String(this.inZone);
    dot.style.setProperty("--zone-size", `${(2 * zoneRadiusPx(opts.holdZoneDeg, window.innerWidth, config.guidance.horizontalFovDeg)).toFixed(0)}px`);

    // Dwell fill round the white circle.
    const dw = this.coverage.dwell;
    const dwellingOnNew = !!dw && cellState(this.coverage, dw.slice, dw.band) !== "captured";
    const fill = opts.dwellFill && !this.autoPaused && dwellingOnNew ? dwellProgress(dw, now, config.coverage.dwellMs) : 0;
    this.targetEl?.style.setProperty("--fill", fill.toFixed(3));
    this.targetEl?.setAttribute("data-aligned", String(opts.holdZone ? this.inZone && target.kind === "band" : p.aligned));
  }

  private instruction(): string {
    if (this.sensorProblem) return NO_SENSOR_TEXT;
    if (this.paused) return PAUSED_TEXT;
    if (this.autoPaused) return AUTO_PAUSE_TEXT;
    if (!this.anchored) return "Stand in the doorway and face into the room.";
    const target = this.currentTarget();
    if (this.phase === "gaps" && target) {
      const d = deltaToTarget(target, this.lap, this.orientation.unwrapped, this.orientation.pitch);
      const left = gaps(this.coverage).length;
      const lead = left === 1 ? "One spot left." : `${left} spots left.`;
      return `${lead} ${gapInstruction(target.kind === "band" ? target.band : "walls", d.dHeading, config.guidance)}`;
    }
    if (this.phase === "done") return "Room captured.";
    return target ? lapInstruction(target) : "";
  }

  private computeView(): CaptureView {
    const target = this.currentTarget();
    const status: Status = this.paused ? "paused" : this.autoPaused || !this.anchored ? "waiting" : "recording";
    return {
      phase: this.phase,
      status,
      pauseReason: this.pauseReason,
      autoPaused: this.autoPaused,
      instruction: this.instruction(),
      cells: this.coverage.cells,
      slices: this.coverage.slices,
      highlightSlice: target?.slice ?? this.lap.guideSlice,
      activeBand:
        target?.kind === "band" ? target.band : bandForPitch(this.orientation.pitch, config.bands),
      progressWords: progressWords(progressFraction(this.coverage), config.progress),
      counts: counts(this.coverage),
      gapsLeft: gaps(this.coverage).length,
      muted: this.speaker.muted,
      sensorProblem: this.sensorProblem,
      recordingError: this.recordingError,
    };
  }

  /** Recompute the view; notify React only if something visible changed. */
  private refresh() {
    const next = this.computeView();
    const prev = this.view;
    const same =
      prev.phase === next.phase &&
      prev.status === next.status &&
      prev.pauseReason === next.pauseReason &&
      prev.instruction === next.instruction &&
      prev.cells === next.cells &&
      prev.highlightSlice === next.highlightSlice &&
      prev.activeBand === next.activeBand &&
      prev.progressWords === next.progressWords &&
      prev.muted === next.muted &&
      prev.sensorProblem === next.sensorProblem &&
      prev.recordingError === next.recordingError;
    if (same) return;
    this.view = next;
    if (next.instruction !== this.lastInstruction && !this.paused && !next.autoPaused) {
      this.lastInstruction = next.instruction;
      this.speaker.say(next.instruction);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private logChanges(changes: CellChange[]) {
    for (const c of changes) {
      addEvent(this.log, "cell", { slice: c.slice, band: c.band, from: c.from, to: c.to, reason: c.reason });
    }
  }

  private logSample() {
    const o = this.orientation;
    const q = this.qualityFresh(performance.now()) ? this.quality : null;
    addSample(
      this.log,
      {
        t: Date.now(),
        pitch: round(o.pitch, 1),
        heading: round(o.heading, 1),
        unwrapped: round(o.unwrapped, 1),
        progress: round(progressOf(o.unwrapped, this.lap.direction), 1),
        absHeading: this.absHeading == null ? null : round(this.absHeading, 1),
        rotationRate: round(this.rotationRate, 1),
        blur: q ? round(q.blur, 1) : null,
        brightness: q ? round(q.brightness, 1) : null,
        slice: currentSlice(this.lap, o.unwrapped, this.coverage.slices),
        band: bandForPitch(o.pitch, config.bands),
        autoPaused: this.autoPaused,
        paused: this.paused,
      },
      config.logging.sampleIntervalMs,
    );
  }

  async persist(status: SavedSession["status"] = this.phase === "done" ? "finished" : "in-progress"): Promise<void> {
    try {
      await saveSession({
        id: this.sessionId,
        updatedAt: Date.now(),
        status,
        phase: this.phase,
        cells: this.coverage.cells,
        lap: this.lap,
        // While paused, save where the person stopped, not where they've wandered since.
        unwrapped: this.paused && this.pausedAtUnwrapped != null ? this.pausedAtUnwrapped : this.orientation.unwrapped,
        muted: this.speaker.muted,
        log: this.log,
      });
    } catch (e) {
      addEvent(this.log, "persist-failed", { error: String(e) });
    }
  }
}

function round(n: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(n * k) / k;
}

function trackInfo(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;
  const s = track.getSettings();
  return { label: track.label, width: s.width, height: s.height, frameRate: s.frameRate, facingMode: s.facingMode };
}
