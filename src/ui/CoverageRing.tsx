import { memo } from "react";
import { BANDS, type Band, type CellState } from "../core/coverage";

// One ring of ticks around the pause button, one tick per cell, in walking order:
// each slice's ceiling, walls and floor sit side by side, slice 0 at the top,
// running clockwise. Green = captured, yellow = passed but not captured (retake,
// skipped, or missed on the way round), grey = not reached yet. The cell the
// guidance is working on is white. No band label: the instruction line says it.

const SIZE = 260;
const C = SIZE / 2;
const INNER = 62;
const OUTER = 80;
const TICK_WIDTH = 4.5;
const LABEL: Record<Band, string> = { ceiling: "Ceiling", walls: "Walls", floor: "Floor" };

const COLOR = {
  done: "var(--color-captured)",
  attention: "var(--color-retake)",
  todo: "rgba(255,255,255,0.3)",
  active: "#ffffff",
};

function point(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function tickColor(st: CellState, passed: boolean, active: boolean): string {
  if (st === "captured") return COLOR.done;
  if (active) return COLOR.active;
  if (st === "retake" || st === "skipped" || passed) return COLOR.attention;
  return COLOR.todo;
}

export interface CoverageRingProps {
  cells: CellState[];
  slices: number;
  highlightSlice: number;
  activeBand: Band;
  /** Slices before this one have been walked past. */
  reachedSlice: number;
  counts: Record<CellState, number>;
}

export const CoverageRing = memo(function CoverageRing({ cells, slices, highlightSlice, activeBand, reachedSlice, counts }: CoverageRingProps) {
  const sliceDeg = 360 / slices;
  const tickDeg = sliceDeg / BANDS.length;
  // Centre of a cell's tick: the slice's three ticks are spread across its width.
  const angle = (s: number, bi: number) => s * sliceDeg + (bi - (BANDS.length - 1) / 2) * tickDeg;
  const label = `Coverage: ${counts.captured} of ${cells.length} areas captured, ${counts.retake} to retake, ${counts.skipped} skipped. Now: ${LABEL[activeBand].toLowerCase()}.`;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="pointer-events-none">
      {Array.from({ length: slices }, (_, s) =>
        BANDS.map((band, bi) => {
          const st = cells[s * BANDS.length + bi];
          const active = s === highlightSlice && band === activeBand;
          const a = angle(s, bi);
          const p0 = point(INNER, a);
          const p1 = point(OUTER, a);
          return (
            <line
              key={`${s}-${band}`}
              x1={p0.x.toFixed(2)}
              y1={p0.y.toFixed(2)}
              x2={p1.x.toFixed(2)}
              y2={p1.y.toFixed(2)}
              stroke={tickColor(st, s < reachedSlice, active)}
              strokeWidth={TICK_WIDTH}
              strokeLinecap="round"
              data-cell={`${s}-${band}`}
              data-state={st}
            />
          );
        }),
      )}
    </svg>
  );
});
