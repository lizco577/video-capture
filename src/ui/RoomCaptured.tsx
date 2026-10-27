import { useEffect, useState } from "react";
import type { CellState } from "../core/coverage";
import { summarise, type SessionLog } from "../core/session-log";
import { skippedSentences } from "../core/wording";
import { buildExport, deliverFiles, downloadFile, formatBytes, type ExportFile } from "../capture/export";
import { Screen } from "./screens";

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
