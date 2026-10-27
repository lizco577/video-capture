import { putChunk } from "./store";

/** First MIME type MediaRecorder supports, in config order. */
export function pickMimeType(types: string[]): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}

export interface SegmentRecorderOptions {
  sessionId: string;
  segment: number;
  stream: MediaStream;
  mimeType: string;
  timesliceMs: number;
  videoBitsPerSecond: number;
  onChunk(bytes: number, seq: number): void;
  onError(message: string): void;
}

/**
 * One MediaRecorder run = one segment. Each timeslice chunk is written to
 * IndexedDB as soon as it arrives, so a reload or crash keeps everything up to
 * the last 2 s. Chunks of one segment concatenate into one playable file.
 */
export class SegmentRecorder {
  private recorder: MediaRecorder;
  private seq = 0;
  private writes: Promise<void>[] = [];
  private stopped: Promise<void>;

  constructor(private o: SegmentRecorderOptions) {
    this.recorder = new MediaRecorder(o.stream, { mimeType: o.mimeType, videoBitsPerSecond: o.videoBitsPerSecond });
    this.recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const seq = this.seq++;
      const write = e.data
        .arrayBuffer()
        .then((data) => putChunk({ sessionId: o.sessionId, segment: o.segment, seq, mimeType: o.mimeType, data }))
        .then(() => o.onChunk(e.data.size, seq))
        .catch((err: unknown) => o.onError(`chunk-write-failed: ${String(err)}`));
      this.writes.push(write);
    };
    this.recorder.onerror = (e) => o.onError(`recorder-error: ${String((e as unknown as { error?: Error }).error ?? e.type)}`);
    this.stopped = new Promise((resolve) => this.recorder.addEventListener("stop", () => resolve(), { once: true }));
  }

  get state(): RecordingState {
    return this.recorder.state;
  }

  start(): void {
    this.recorder.start(this.o.timesliceMs);
  }

  /** Stop and wait until the final chunk is safely in IndexedDB. */
  async stop(): Promise<void> {
    if (this.recorder.state !== "inactive") {
      try {
        this.recorder.requestData();
      } catch {
        // Some Safari versions throw if no data is pending.
      }
      this.recorder.stop();
      await Promise.race([this.stopped, new Promise((r) => setTimeout(r, 3000))]);
    }
    await Promise.all(this.writes);
  }
}
