import { config } from "../config";
import { counts, type CellState } from "../core/coverage";
import { summarise, type SessionLog } from "../core/session-log";
import { segmentsFor } from "../platform/store";

// "Download recording + log": one video file per segment plus session.json.

export interface ExportFile {
  file: File;
  label: string;
}

function extFor(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

export async function buildExport(sessionId: string, log: SessionLog, cells: CellState[]): Promise<ExportFile[]> {
  const short = sessionId.slice(0, 8);
  const segments = await segmentsFor(sessionId);
  const files: ExportFile[] = segments.map((s) => {
    const type = s.mimeType.split(";")[0];
    const name = `lumasite-${short}-segment${s.segment + 1}.${extFor(s.mimeType)}`;
    return { file: new File(s.parts, name, { type }), label: `Video, part ${s.segment + 1}` };
  });
  const json = {
    ...log,
    exportedAt: new Date().toISOString(),
    summary: summarise(log),
    finalCoverage: { slices: config.coverage.slices, bands: ["ceiling", "walls", "floor"], cells, counts: counts({ cells, slices: config.coverage.slices, dwell: null }) },
    storedSegments: segments.map((s) => ({ segment: s.segment, chunks: s.parts.length, bytes: s.parts.reduce((a, p) => a + p.byteLength, 0) })),
  };
  files.push({
    file: new File([JSON.stringify(json, null, 1)], `lumasite-${short}-session.json`, { type: "application/json" }),
    label: "Session log",
  });
  return files;
}

/** Share sheet where it can take files (iOS: "Save to Files"), otherwise one download per file. */
export async function deliverFiles(files: File[]): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files, title: "Room recording" });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
    }
  }
  for (const f of files) {
    downloadFile(f);
    await new Promise((r) => setTimeout(r, 400));
  }
  return "downloaded";
}

export function downloadFile(f: File): void {
  const url = URL.createObjectURL(f);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
