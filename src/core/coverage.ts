import { wrap360 } from "./angles";

// The coverage model: `slices` × 3 bands. Slices are numbered in walking order,
// starting with slice 0 centred on the doorway heading.

export const BANDS = ["ceiling", "walls", "floor"] as const;
export type Band = (typeof BANDS)[number];
export type CellState = "missing" | "captured" | "retake" | "skipped";

export interface CellRef {
  slice: number;
  band: Band;
}

export interface CellChange extends CellRef {
  from: CellState;
  to: CellState;
  t: number;
  reason: "dwell-good" | "dwell-bad" | "skip";
}

export interface Dwell extends CellRef {
  enteredAt: number;
  goodSince: number | null;
  badSince: number | null;
}

export interface CoverageState {
  slices: number;
  /** Index = slice * 3 + band index. */
  cells: CellState[];
  dwell: Dwell | null;
}

export interface CoverageInput {
  t: number;
  /** Null when the slice isn't known yet (e.g. walking direction undecided). */
  slice: number | null;
  band: Band;
  /** Frame sharp + well lit and rotation slow enough. */
  good: boolean;
  /** True while paused or auto-paused: dwell timers stop and reset. */
  frozen: boolean;
}

export function bandIndex(band: Band): number {
  return BANDS.indexOf(band);
}

export function cellIndex(slice: number, band: Band): number {
  return slice * 3 + bandIndex(band);
}

export function initialCoverage(slices: number): CoverageState {
  return { slices, cells: new Array(slices * 3).fill("missing"), dwell: null };
}

export function cellState(s: CoverageState, slice: number, band: Band): CellState {
  return s.cells[cellIndex(slice, band)];
}

export function bandForPitch(pitch: number, b: { ceilingAbovePitchDeg: number; floorBelowPitchDeg: number }): Band {
  if (pitch > b.ceilingAbovePitchDeg) return "ceiling";
  if (pitch < b.floorBelowPitchDeg) return "floor";
  return "walls";
}

/** Slice for a progress angle (degrees in the walking direction). Slice 0 is centred on 0°. */
export function sliceForProgress(progressDeg: number, slices: number): number {
  const width = 360 / slices;
  return Math.floor(wrap360(progressDeg + width / 2) / width) % slices;
}

export function sliceCenterProgress(slice: number, slices: number): number {
  return slice * (360 / slices);
}

/** Advance the dwell state machine by one tick. Pure. */
export function stepCoverage(
  s: CoverageState,
  input: CoverageInput,
  dwellMs: number,
): { state: CoverageState; changes: CellChange[] } {
  if (input.frozen || input.slice == null) {
    return { state: s.dwell ? { ...s, dwell: null } : s, changes: [] };
  }
  const { t, slice, band, good } = input;
  let dwell: Dwell;
  if (!s.dwell || s.dwell.slice !== slice || s.dwell.band !== band) {
    dwell = { slice, band, enteredAt: t, goodSince: good ? t : null, badSince: good ? null : t };
  } else {
    dwell = {
      ...s.dwell,
      goodSince: good ? (s.dwell.goodSince ?? t) : null,
      badSince: good ? null : (s.dwell.badSince ?? t),
    };
  }

  const i = cellIndex(slice, band);
  const from = s.cells[i];
  let to = from;
  let reason: CellChange["reason"] = "dwell-good";
  if (from !== "captured") {
    if (dwell.goodSince != null && t - dwell.goodSince >= dwellMs) {
      to = "captured";
    } else if (from === "missing" && dwell.badSince != null && t - dwell.badSince >= dwellMs) {
      // Held on the cell for a full dwell with bad quality the whole time. Brief bad
      // moments (e.g. still turning while arriving) don't count.
      to = "retake";
      reason = "dwell-bad";
    }
  }

  if (to === from) return { state: { ...s, dwell }, changes: [] };
  const cells = s.cells.slice();
  cells[i] = to;
  return { state: { ...s, cells, dwell }, changes: [{ slice, band, from, to, t, reason }] };
}

/** Mark a cell as skipped ("Something in the way?"). Captured cells stay captured. */
export function skipCell(
  s: CoverageState,
  slice: number,
  band: Band,
  t: number,
): { state: CoverageState; changes: CellChange[] } {
  const i = cellIndex(slice, band);
  const from = s.cells[i];
  if (from === "captured" || from === "skipped") return { state: s, changes: [] };
  const cells = s.cells.slice();
  cells[i] = "skipped";
  return { state: { ...s, cells }, changes: [{ slice, band, from, to: "skipped", t, reason: "skip" }] };
}

/** True when no band of the slice is still missing (retake counts as attempted). */
export function sliceAttempted(s: CoverageState, slice: number): boolean {
  return BANDS.every((b) => cellState(s, slice, b) !== "missing");
}

/** Cells that still need something: missing or retake. Ordered by slice, then band. */
export function gaps(s: CoverageState): CellRef[] {
  const out: CellRef[] = [];
  for (let slice = 0; slice < s.slices; slice++)
    for (const band of BANDS) {
      const st = cellState(s, slice, band);
      if (st === "missing" || st === "retake") out.push({ slice, band });
    }
  return out;
}

export function counts(s: CoverageState): Record<CellState, number> {
  const c: Record<CellState, number> = { missing: 0, captured: 0, retake: 0, skipped: 0 };
  for (const st of s.cells) c[st]++;
  return c;
}

/** Share of cells that are done (captured or deliberately skipped). */
export function progressFraction(s: CoverageState): number {
  const c = counts(s);
  return (c.captured + c.skipped) / s.cells.length;
}

export function progressWords(fraction: number, scale: { upTo: number; words: string }[]): string {
  for (const step of scale) if (fraction < step.upTo) return step.words;
  return scale[scale.length - 1].words;
}
