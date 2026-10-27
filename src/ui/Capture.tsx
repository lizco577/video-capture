import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CaptureController, type CaptureView, type LiveStats } from "../capture/CaptureController";
import type { SavedSession } from "../platform/store";
import { CoverageRing } from "./CoverageRing";
import { CloseIcon, HelpIcon, PauseIcon, PlayIcon, SpeakerIcon } from "./icons";
import { HelpSheet } from "./HelpSheet";
import { simEnabled } from "../dev/sim";
import { SimPanel } from "../dev/SimPanel";

const STATUS_TEXT = { recording: "Recording", waiting: "Waiting for you", paused: "Paused" } as const;

export interface CaptureProps {
  sessionId: string;
  stream: MediaStream;
  permissions: Record<string, string>;
  restore?: SavedSession;
  reacquireCamera(): Promise<MediaStream>;
  onExit(): void;
  onFinishLater(): void;
  onDone(c: CaptureController): void;
}

export function Capture(props: CaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<CaptureController | null>(null);

  useEffect(() => {
    const video = videoRef.current!;
    video.srcObject = props.stream;
    void video.play().catch(() => undefined);
    const c = new CaptureController({
      sessionId: props.sessionId,
      stream: props.stream,
      video,
      permissions: props.permissions,
      restore: props.restore,
      reacquireCamera: props.reacquireCamera,
    });
    c.setDotElements(dotRef.current, targetRef.current);
    c.start();
    setController(c);
    if (import.meta.env.DEV) (window as unknown as { __capture: CaptureController }).__capture = c;
    return () => {
      void c.destroy();
    };
    // The controller lives for the whole capture screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-viewfinder text-white">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted autoPlay />
      {/* Centre target and the follow-the-dot guide. */}
      <div
        ref={targetRef}
        className="target-ring pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white"
        aria-hidden="true"
      >
        {/* Dwell fill: a ring that fills while the current spot is held (--fill 0–1). */}
        <svg className="dwell-fill" viewBox="0 0 88 88" width="88" height="88">
          <circle cx="44" cy="44" r="40" />
        </svg>
      </div>
      {/* The dot, with its hold zone and the edge arrow that replaces it when off screen. */}
      <div
        ref={dotRef}
        className="dot pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 opacity-0 transition-opacity"
        style={{ transform: "translate(-50%, -50%)" }}
        aria-hidden="true"
      >
        <div className="dot-zone" />
        <div className="dot-core" />
        <div className="dot-arrow">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M9 5l7 7-7 7" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {controller && <Overlay c={controller} {...props} />}
      {simEnabled() && <SimPanel />}
    </div>
  );
}

function useView(c: CaptureController): CaptureView {
  return useSyncExternalStore(
    (fn) => c.subscribe(fn),
    () => c.getView(),
  );
}

function Overlay({ c, onExit, onFinishLater, onDone }: { c: CaptureController } & CaptureProps) {
  const view = useView(c);
  const [helpOpen, setHelpOpen] = useState(false);
  const [debug, setDebug] = useState(false);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    if (view.phase === "done") onDone(c);
  }, [view.phase, c, onDone]);

  const onPillTap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 700), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setDebug((d) => !d);
    }
  };

  const paused = view.status === "paused";
  const showPausedSheet = paused && view.phase !== "done";

  return (
    <>
      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-4"
        style={{ paddingTop: "calc(var(--safe-top) + 12px)" }}
      >
        <button
          className="frost-btn h-11 w-11"
          aria-label="Pause and exit"
          onClick={async () => {
            await c.finishLater();
            onExit();
          }}
        >
          <CloseIcon />
        </button>
        <button
          className="frost flex min-h-[44px] items-center gap-2 rounded-full px-4 text-tip font-semibold"
          onClick={onPillTap}
          aria-label={`Status: ${STATUS_TEXT[view.status]}`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${view.status === "recording" ? "bg-record" : view.status === "waiting" ? "bg-retake" : "bg-white"}`}
            aria-hidden="true"
          />
          {STATUS_TEXT[view.status]}
        </button>
        <button className="frost-btn h-11 w-11" aria-label="Help" onClick={() => setHelpOpen(true)}>
          <HelpIcon />
        </button>
      </div>

      {/* Instruction bubble */}
      {!showPausedSheet && (
        <div className="absolute inset-x-4" style={{ top: "calc(var(--safe-top) + 72px)" }}>
          <p
            className="rounded px-4 py-3 text-body text-white"
            style={{ background: "var(--bubble-bg)" }}
            data-testid="instruction"
          >
            {view.instruction}
          </p>
          <div className="mt-2 inline-block frost rounded-full px-4 py-1.5 text-tip font-semibold" data-testid="progress">
            {view.progressWords}
          </div>
          {view.recordingError && (
            <p className="mt-2 rounded px-4 py-2 text-tip text-white" style={{ background: "var(--bubble-bg)" }}>
              Recording problem: {view.recordingError}
            </p>
          )}
        </div>
      )}

      {/* Screen-reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {STATUS_TEXT[view.status]}. {view.instruction}
      </div>

      {/* Bottom: progress, ring + pause, skip, mute */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}
      >
        <div className="relative -mb-4 flex h-[260px] w-[260px] items-center justify-center">
          {/* Dark disc so white "missing" cells stay visible over bright rooms. */}
          <div className="frost absolute h-[176px] w-[176px] rounded-full" style={{ background: "rgba(0,0,0,0.35)" }} aria-hidden="true" />
          <div className="absolute inset-0">
            <CoverageRing
              cells={view.cells}
              slices={view.slices}
              highlightSlice={view.highlightSlice}
              activeBand={view.activeBand}
              counts={view.counts}
            />
          </div>
          <button
            className="frost-btn relative h-16 w-16"
            aria-label={paused ? "Resume recording" : "Pause recording"}
            onClick={() => (paused ? void c.resume() : void c.pause("user"))}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        </div>
        <div className="flex w-full items-center justify-between px-4">
          <button
            className="frost-btn h-11 w-11"
            aria-label={view.muted ? "Turn voice on" : "Turn voice off"}
            aria-pressed={view.muted}
            onClick={() => c.setMuted(!view.muted)}
          >
            <SpeakerIcon muted={view.muted} />
          </button>
          <button className="frost-btn px-4 text-tip font-semibold" onClick={() => c.skipHere()} disabled={paused}>
            {view.phase === "gaps" ? "Can't reach this spot?" : "Something in the way?"}
          </button>
          <span className="w-11" aria-hidden="true" />
        </div>
      </div>

      {showPausedSheet && <PausedSheet onResume={() => void c.resume()} />}
      {helpOpen && (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          onFinishLater={async () => {
            setHelpOpen(false);
            await c.finishLater();
            onFinishLater();
          }}
        />
      )}
      {debug && <DebugOverlay c={c} onClose={() => setDebug(false)} />}
    </>
  );
}

function PausedSheet({ onResume }: { onResume(): void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/40" role="dialog" aria-labelledby="paused-title">
      <div
        className="w-full rounded-t-2xl bg-white px-4 pt-6 text-text"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}
      >
        <h2 id="paused-title" className="text-title">
          Recording paused
        </h2>
        <p className="mt-3 text-body">Everything so far is saved. Go back to where you stopped, then tap Resume.</p>
        <button className="btn-primary mt-6" onClick={onResume} autoFocus>
          Resume
        </button>
      </div>
    </div>
  );
}

function DebugOverlay({ c, onClose }: { c: CaptureController; onClose(): void }) {
  const [live, setLive] = useState<LiveStats>(() => c.getLive());
  useEffect(() => {
    const id = window.setInterval(() => setLive(c.getLive()), 250);
    return () => window.clearInterval(id);
  }, [c]);
  const f = (n: number | null, dp = 1) => (n == null ? "–" : n.toFixed(dp));
  const rows: [string, string][] = [
    ["fps", f(live.fps, 0)],
    ["quality Hz", `${f(live.qualityHz, 1)} ${live.qualityInWorker ? "(worker)" : "(main)"} ${f(live.qualityMs, 1)}ms`],
    ["pitch", f(live.pitch)],
    ["heading", `${f(live.heading)} raw`],
    ["unwrapped", `${f(live.unwrapped)} (dir ${live.direction ?? "?"})`],
    ["progress", f(live.progress)],
    ["abs heading", f(live.absHeading)],
    ["rotation °/s", f(live.rotationRate)],
    ["blur", f(live.blur)],
    ["brightness", f(live.brightness)],
    ["cell", live.cell],
    ["drift est.", f(live.driftDeg)],
    ["codec", live.codec ?? "none"],
    ["segment", `${live.segment + 1} · ${(live.bytes / 1024 / 1024).toFixed(1)} MB`],
  ];
  return (
    <div
      className="absolute left-2 rounded bg-black/80 p-2 font-mono text-[11px] leading-4 text-white"
      style={{ top: "calc(var(--safe-top) + 140px)" }}
      onClick={onClose}
      data-testid="debug-overlay"
    >
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="text-white/60">{k}</span> {v}
        </div>
      ))}
      <button
        className="mt-1 underline"
        onClick={(e) => {
          e.stopPropagation();
          const blob = new Blob([JSON.stringify(c.getLog(), null, 1)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `lumasite-${c.sessionId.slice(0, 8)}-session-partial.json`;
          a.click();
        }}
      >
        save log now
      </button>
    </div>
  );
}
