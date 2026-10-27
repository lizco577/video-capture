// Stub for the later chunked, resumable upload. Not built in the spike: the
// prototype downloads files instead. The shape mirrors what's already stored in
// IndexedDB (segments of ordered chunks), so a real uploader can resume from the
// last acknowledged chunk after a reload.

export interface UploadProgress {
  sessionId: string;
  segment: number;
  /** Highest chunk seq the server has acknowledged, or -1. */
  ackedSeq: number;
  bytesSent: number;
}

export interface ChunkedUploader {
  /** Create or look up the server-side upload for this session. */
  begin(sessionId: string): Promise<{ uploadId: string }>;
  /** Send one chunk. Must be idempotent by (segment, seq) so retries are safe. */
  sendChunk(uploadId: string, segment: number, seq: number, data: ArrayBuffer): Promise<void>;
  /** Where to resume after a reload or network loss. */
  status(uploadId: string): Promise<UploadProgress[]>;
  /** Attach the session log and mark the upload complete. */
  finish(uploadId: string, sessionLog: unknown): Promise<void>;
}

export class NotImplementedUploader implements ChunkedUploader {
  begin(): Promise<{ uploadId: string }> {
    return Promise.reject(new Error("Upload isn't part of the spike yet; use Download."));
  }
  sendChunk(): Promise<void> {
    return Promise.reject(new Error("not implemented"));
  }
  status(): Promise<UploadProgress[]> {
    return Promise.resolve([]);
  }
  finish(): Promise<void> {
    return Promise.reject(new Error("not implemented"));
  }
}
