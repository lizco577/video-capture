import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { summarise, type SessionLog } from "../core/session-log";
import { chunksFor, type StoredChunk } from "./store";

// Upload to Supabase after "Room captured". Each recorder chunk (2 s, about 1 MB)
// goes up as its own object, so no single upload comes near the free plan's 50 MB
// limit, and a dropped connection or reload only repeats the chunks not yet sent.
// Chunks of one segment concatenated in order are the playable file
// (scripts/fetch-capture.mjs does that). Setup: supabase/setup.sql and .env.local.

const BUCKET = "captures";
const PARALLEL = 3;

export interface UploadProgress {
  sessionId: string;
  chunksDone: number;
  chunksTotal: number;
  bytesSent: number;
  bytesTotal: number;
}

export interface ChunkedUploader {
  /** Create or look up the server-side upload for this session. */
  begin(sessionId: string): Promise<{ uploadId: string }>;
  /** Send one chunk. Must be idempotent by (segment, seq) so retries are safe. */
  sendChunk(uploadId: string, chunk: StoredChunk): Promise<void>;
  /** Attach the session log and mark the upload complete. */
  finish(uploadId: string, log: SessionLog, sessionJson: File): Promise<void>;
}

let client: SupabaseClient | null | undefined;

function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function uploadConfigured(): boolean {
  return supabase() !== null;
}

/** The anon key can't overwrite, so "already exists" means an earlier attempt landed. */
function alreadyThere(error: { message?: string; statusCode?: string | number; code?: string } | null): boolean {
  if (!error) return false;
  return String(error.statusCode) === "409" || error.code === "23505" || /already exists|duplicate/i.test(error.message ?? "");
}

export class SupabaseUploader implements ChunkedUploader {
  constructor(private sb: SupabaseClient) {}

  begin(sessionId: string): Promise<{ uploadId: string }> {
    return Promise.resolve({ uploadId: sessionId });
  }

  async sendChunk(uploadId: string, c: StoredChunk): Promise<void> {
    const path = `${uploadId}/seg${c.segment}/${String(c.seq).padStart(6, "0")}.part`;
    const { error } = await this.sb.storage
      .from(BUCKET)
      .upload(path, c.data, { contentType: c.mimeType.split(";")[0], upsert: false });
    if (error && !alreadyThere(error)) throw error;
  }

  async finish(uploadId: string, log: SessionLog, sessionJson: File): Promise<void> {
    const up = await this.sb.storage
      .from(BUCKET)
      .upload(`${uploadId}/session.json`, sessionJson, { contentType: "application/json", upsert: false });
    if (up.error && !alreadyThere(up.error)) throw up.error;

    const s = summarise(log);
    const { error } = await this.sb.from("capture_sessions").insert({
      id: uploadId,
      recorded_at: log.createdAt,
      platform: log.device.platform,
      user_agent: log.device.userAgent,
      codec: log.codec,
      duration_s: Math.round(s.durationMs / 100) / 10,
      segments: s.segments,
      chunks: log.segments.reduce((a, g) => a + g.chunks, 0),
      bytes: s.totalBytes,
      fps_mean: s.fps?.mean ?? null,
      fps_min: s.fps?.min ?? null,
      quality_hz: s.qualityHz,
      drift_deg: s.driftDeg,
      auto_pauses: s.autoPauses,
      summary: s,
      segment_files: log.segments.map((g) => ({ segment: g.index, mimeType: g.mimeType, chunks: g.chunks, bytes: g.bytes })),
    });
    if (error && !alreadyThere(error)) throw error;
  }
}

// Which chunks this phone has already sent, so a retry skips them.
function doneKey(sessionId: string) {
  return `lumasite-upload:${sessionId}`;
}

function loadDone(sessionId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(sessionId)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveDone(sessionId: string, done: Set<string>): void {
  try {
    localStorage.setItem(doneKey(sessionId), JSON.stringify([...done]));
  } catch {
    // Storage blocked: a retry re-sends chunks, which the server ignores as duplicates.
  }
}

/** Sends every stored chunk, then session.json and the summary row. Safe to call again after a failure. */
export async function uploadCapture(
  sessionId: string,
  log: SessionLog,
  sessionJson: File,
  onProgress: (p: UploadProgress) => void,
): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Supabase isn't set up (see .env.local).");
  const uploader = new SupabaseUploader(sb);
  const { uploadId } = await uploader.begin(sessionId);

  const chunks = await chunksFor(sessionId);
  const done = loadDone(sessionId);
  const key = (c: StoredChunk) => `${c.segment}:${c.seq}`;
  const p: UploadProgress = {
    sessionId,
    chunksDone: 0,
    chunksTotal: chunks.length,
    bytesSent: 0,
    bytesTotal: chunks.reduce((a, c) => a + c.data.byteLength, 0),
  };
  for (const c of chunks) {
    if (!done.has(key(c))) continue;
    p.chunksDone++;
    p.bytesSent += c.data.byteLength;
  }
  onProgress({ ...p });

  const queue = chunks.filter((c) => !done.has(key(c)));
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      await uploader.sendChunk(uploadId, c);
      done.add(key(c));
      saveDone(sessionId, done);
      p.chunksDone++;
      p.bytesSent += c.data.byteLength;
      onProgress({ ...p });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  await uploader.finish(uploadId, log, sessionJson);
}
