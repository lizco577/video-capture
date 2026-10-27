import { memo } from "react";
import { BANDS, type Band, type CellState } from "../core/coverage";

// 12 slices × 3 bands around the pause button. Outer = ceiling, middle = walls,
// inner = floor. State is shown by colour *and* line weight / dash pattern so it
// reads without colour. Slice 0 is at the top; slices run clockwise in walking order.

const SIZE = 260;
const C = SIZE / 2;
const RADIUS: Record<Band, number> = { ceiling: 74, walls: 61, floor: 48 };
const GAP_DEG = 3;
const LABEL: Record<Band, string> = { ceiling: "Ceiling", walls: "Walls", floor: "Floor" };

const STYLE: Record<CellState, { stroke: string; width: number; dash?: string; opacity: number; cap: "butt" | "round" }> = {
  captured: { stroke: "var(--color-captured)", width: 9, opacity: 1, cap: "butt" },
  retake: { stroke: "var(--color-retake)", width: 6, dash: "5 3", opacity: 1, cap: "butt" },
  missing: { stroke: "#ffffff", width: 2, opacity: 0.3, cap: "butt" },
  skipped: { stroke: "#ffffff", width: 3, dash: "0.1 5", opacity: 1, cap: "round" },
};

function point(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function arc(r: number, from: number, to: number) {
  const p0 = point(r, from);
  const p1 = point(r, to);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

function wedge(r0: number, r1: number, from: number, to: number) {
  const a = point(r1, from);
  const b = point(r1, to);
  const c = point(r0, to);
  const d = point(r0, from);
  return `M ${a.x} ${a.y} A ${r1} ${r1} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${r0} ${r0} 0 0 0 ${d.x} ${d.y} Z`;
}

export interface CoverageRingProps {
  cells: CellState[];
  slices: number;
  highlightSlice: number;
  activeBand: Band;
  counts: Record<CellState, number>;
}

export const CoverageRing = memo(function CoverageRing({ cells, slices, highlightSlice, activeBand, counts }: CoverageRingProps) {
  const width = 360 / slices;
  const from = (s: number) => s * width - width / 2 + GAP_DEG / 2;
  const to = (s: number) => s * width + width / 2 - GAP_DEG / 2;
  const mid = highlightSlice * width;
  const tagPos = point(RADIUS.ceiling + 30, mid);
  const label = `Coverage: ${counts.captured} of ${cells.length} areas captured, ${counts.retake} to retake, ${counts.skipped} skipped. Now: ${LABEL[activeBand].toLowerCase()}.`;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} className="pointer-events-none">
      <path
        d={wedge(RADIUS.floor - 8, RADIUS.ceiling + 8, mid - width / 2, mid + width / 2)}
        fill="rgba(255,255,255,0.16)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={1.5}
        data-testid="ring-highlight"
      />
      {BANDS.map((band, bi) => (
        <g key={band} opacity={band === activeBand ? 1 : 0.4} data-band={band}>
          {Array.from({ length: slices }, (_, s) => {
            const st = cells[s * 3 + bi];
            const style = STYLE[st];
            return (
              <path
                key={s}
                d={arc(RADIUS[band], from(s), to(s))}
                fill="none"
                stroke={style.stroke}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                strokeOpacity={style.opacity}
                strokeLinecap={style.cap}
                data-cell={`${s}-${band}`}
                data-state={st}
              />
            );
          })}
        </g>
      ))}
      <g transform={`translate(${tagPos.x} ${tagPos.y})`} data-testid="band-tag">
        <rect x={-32} y={-12} width={64} height={24} rx={12} fill="rgba(0,0,0,0.6)" />
        <text
          x={0}
          y={5}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={13}
          fontWeight={600}
          fontFamily="Work Sans, system-ui, sans-serif"
        >
          {LABEL[activeBand]}
        </text>
      </g>
    </svg>
  );
});
