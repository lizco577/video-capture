import { useEffect, useState } from "react";
import { onSimChange, sim, simState } from "./sim";
import { config, type DotOptions } from "../config";

const DOT_FLAGS: [keyof DotOptions, string][] = [
  ["edgeArrow", "edge arrow"],
  ["dwellFill", "dwell fill"],
  ["smoothMove", "smooth move"],
  ["holdZone", "hold zone"],
];

/** On-screen controls for ?sim=1. Arrow keys turn and tilt; buttons script a lap. */
export function SimPanel() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => onSimChange(() => force((n) => n + 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 15 : 5;
      if (e.key === "ArrowLeft") sim.moveTo(simState.pitch, simState.turned - step, 40);
      if (e.key === "ArrowRight") sim.moveTo(simState.pitch, simState.turned + step, 40);
      if (e.key === "ArrowUp") sim.moveTo(simState.pitch + step, simState.turned, 40);
      if (e.key === "ArrowDown") sim.moveTo(simState.pitch - step, simState.turned, 40);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const btn = "rounded bg-white/90 px-2 py-1 text-[11px] font-semibold text-black";
  return (
    <div className="absolute right-1 z-50 w-28 rounded bg-black/60 p-1.5 text-[10px] leading-tight text-white"
      style={{ top: "calc(var(--safe-top) + 150px)" }} data-testid="sim-panel">
      <button className="w-full text-left font-semibold" onClick={() => setOpen(!open)}>
        Simulator {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          <div>
            pitch {simState.pitch.toFixed(0)} · turned {simState.turned.toFixed(0)}
          </div>
          <button className={btn} onClick={() => void sim.autoLap()} disabled={simState.running}>
            Auto lap
          </button>
          <button className={btn} onClick={() => void sim.autoLap({ leaveGaps: [[3, "floor"], [8, "ceiling"]] })} disabled={simState.running}>
            Auto lap, leave 2 gaps
          </button>
          <button className={btn} onClick={() => sim.stop()}>
            Stop
          </button>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={simState.shaking} onChange={(e) => sim.shake(e.target.checked)} /> shake
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={simState.dim} onChange={(e) => sim.dim(e.target.checked)} /> dim
          </label>
          <div className="text-white/60">Arrows turn / tilt (shift = bigger)</div>
          <div className="mt-1 font-semibold">Blue dot</div>
          {DOT_FLAGS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={config.guidance.dot[key] as boolean}
                onChange={(e) => {
                  (config.guidance.dot[key] as boolean) = e.target.checked;
                  force((n) => n + 1);
                }}
              />{" "}
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
