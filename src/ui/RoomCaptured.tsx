import { useEffect, useState } from "react";
import type { CellState } from "../core/coverage";
import { summarise, type SessionLog } from "../core/session-log";
import { skippedSentences } from "../core/wording";
import { buildExport, deliverFiles, downloadFile, formatBytes, type ExportFile } from "../capture/export";
import { uploadCapture, uploadConfigured, type UploadProgress } from "../platform/upload";
import { Screen } from "./screens";

type Upload =
  | { state: "off" }
  | { state: "sending"; progress: UploadProgress | null }
  | { state: "done" }
  | { state: "failed"; error: string };

export function RoomCaptured({
  sessionId,
  log,
  cells,
  onNewRoom,
}: {
  sessionId: string;
  log: SessionLog;
  cells: CellState[];
  onNewRoom(): void;
}) {
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const skipped = skippedSentences(cells);
  const summary = summarise(log);

  useEffect(() => {
    let alive = true;
    // Give the recorder's last chunk a moment to land in IndexedDB.
    const id = window.setTimeout(() => {
      void buildExport(sessionId, log, cells).then((f) => alive && setFiles(f));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [sessionId, log, cells]);

  const [upload, setUpload] = useState<Upload>(uploadConfigured() ? { state: "sending", progress: null } : { state: "off" });
  const sendToServer = async (all: ExportFile[]) => {
    setUpload({ state: "sending", progress: null });
    try {
      // The session log is always the last export file.
      await uploadCapture(sessionId, log, all[all.length - 1].file, (progress) => setUpload({ state: "sending", progress }));
      setUpload({ state: "done" });
    } catch (e) {
      setUpload({ state: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (files && uploadConfigured()) void sendToServer(files);
    // Once per capture; "Try again" re-runs it by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const download = async () => {
    if (!files) return;
    setStatus("Preparing files…");
    const r = await deliverFiles(files.map((f) => f.file));
    setStatus(r === "cancelled" ? null : r === "shared" ? "Shared." : "Downloads started.");
  };

  const fps = summary.fps;
  return (
    <Screen
      title="Room captured"
      actions={
        <>
          <button className="btn-secondary" onClick={onNewRoom}>
            Capture another room
          </button>
          <button className="btn-primary" onClick={download} disabled={!files} aria-busy={!files}>
            Download recording + log
          </button>
        </>
      }
    >
      <p>That's everything we need from this room.</p>
      {skipped.length > 0 && <p data-testid="skipped-note">{skipped.join(" ")}</p>}
      {status && (
        <p className="text-tip text-text-2" role="status">
          {status}
        </p>
      )}
      {upload.state !== "off" && (
        <p className="text-tip text-text-2" role="status" data-testid="upload-status">
          {upload.state === "sending" &&
            (upload.progress
              ? `Uploading: ${formatBytes(upload.progress.bytesSent)} of ${formatBytes(upload.progress.bytesTotal)}. Keep this page open.`
              : "Starting upload…")}
          {upload.state === "done" && "Uploaded. You can close this page."}
          {upload.state === "failed" && (
            <>
              Upload stopped ({upload.error}).{" "}
              <button className="min-h-[44px] underline" onClick={() => files && void sendToServer(files)}>
                Try again
              </button>
            </>
          )}
        </p>
      )}

      <section className="rounded border border-border bg-quiet p-4 text-tip" aria-label="Spike numbers">
        <h2 className="font-semibold">For the spike</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-text-2">Time</dt>
          <dd>{Math.round(summary.durationMs / 1000)} s</dd>
          <dt className="text-text-2">UI fps (mean / min)</dt>
          <dd>{fps ? `${fps.mean.toFixed(0)} / ${fps.min.toFixed(0)}` : "–"}</dd>
          <dt className="text-text-2">Quality samples</dt>
          <dd>{summary.qualityHz ? `${summary.qualityHz.toFixed(1)} /s` : "–"}</dd>
          <dt className="text-text-2">Heading drift</dt>
          <dd>{summary.driftDeg == null ? "no compass" : `${summary.driftDeg.toFixed(1)}°`}</dd>
          <dt className="text-text-2">Auto-pauses</dt>
          <dd>{summary.autoPauses}</dd>
          <dt className="text-text-2">Codec</dt>
          <dd className="break-all">{log.codec ?? "–"}</dd>
        </dl>
        {files && (
          <ul className="mt-3 space-y-1">
            {files.map((f) => (
              <li key={f.file.name}>
                <button className="min-h-[44px] text-left underline" onClick={() => downloadFile(f.file)}>
                  {f.label} ({formatBytes(f.file.size)})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}
