import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CellState } from "../core/coverage";
import type { LapState } from "../core/lap";
import type { SessionLog } from "../core/session-log";

// IndexedDB persistence: every recorded chunk as it arrives, plus the session state
// (coverage, lap, log) so a reload, crash or "Finish later" loses nothing.

export type Phase = "lap" | "gaps" | "done";

export interface SavedSession {
  id: string;
  updatedAt: number;
  status: "in-progress" | "finished";
  phase: Phase;
  cells: CellState[];
  lap: LapState;
  /** Unwrapped heading when the session was last saved: where to "go back to". */
  unwrapped: number;
  muted: boolean;
  log: SessionLog;
}

export interface StoredChunk {
  sessionId: string;
  segment: number;
  seq: number;
  mimeType: string;
  /** ArrayBuffer rather than Blob: older iOS Safari versions lose Blobs stored in IndexedDB. */
  data: ArrayBuffer;
}

interface CaptureDB extends DBSchema {
  sessions: { key: string; value: SavedSession; indexes: { byUpdated: number } };
  chunks: { key: [string, number, number]; value: StoredChunk; indexes: { bySession: string } };
}

let dbPromise: Promise<IDBPDatabase<CaptureDB>> | null = null;

function db() {
  dbPromise ??= openDB<CaptureDB>("lumasite-capture", 1, {
    upgrade(d) {
      const sessions = d.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("byUpdated", "updatedAt");
      const chunks = d.createObjectStore("chunks", { keyPath: ["sessionId", "segment", "seq"] });
      chunks.createIndex("bySession", "sessionId");
    },
  });
  return dbPromise;
}

export async function saveSession(s: SavedSession): Promise<void> {
  await (await db()).put("sessions", s);
}

export async function loadSession(id: string): Promise<SavedSession | undefined> {
  return (await db()).get("sessions", id);
}

export async function latestUnfinishedSession(): Promise<SavedSession | undefined> {
  const all = await (await db()).getAllFromIndex("sessions", "byUpdated");
  return all.reverse().find((s) => s.status === "in-progress");
}

export async function putChunk(c: StoredChunk): Promise<void> {
  await (await db()).put("chunks", c);
}

/** All chunks for a session, grouped per segment in order. */
export async function segmentsFor(sessionId: string): Promise<{ segment: number; mimeType: string; parts: ArrayBuffer[] }[]> {
  const chunks = await (await db()).getAllFromIndex("chunks", "bySession", sessionId);
  chunks.sort((a, b) => a.segment - b.segment || a.seq - b.seq);
  const out: { segment: number; mimeType: string; parts: ArrayBuffer[] }[] = [];
  for (const c of chunks) {
    let seg = out.find((s) => s.segment === c.segment);
    if (!seg) out.push((seg = { segment: c.segment, mimeType: c.mimeType, parts: [] }));
    seg.parts.push(c.data);
  }
  return out;
}

export async function deleteSession(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["sessions", "chunks"], "readwrite");
  await tx.objectStore("sessions").delete(id);
  const keys = await tx.objectStore("chunks").index("bySession").getAllKeys(id);
  await Promise.all(keys.map((k) => tx.objectStore("chunks").delete(k)));
  await tx.done;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
