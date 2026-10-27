import type { DotOptions } from "../config";
import type { CellRef, Dwell } from "./coverage";
import type { Target } from "./guidance";

// Pure helpers for the blue-dot UX variants (edge arrow, dwell fill, smooth move,
// hold zone). The controller applies them to the DOM each frame.

export interface Point {
  x: number;
  y: number;
}

/** Identity of a target, so a change of target can be detected. */
export function targetKey(t: Target | null): string {
  if (!t) return "none";
  return t.kind === "band" ? `${t.slice}:${t.band}` : `step:${t.slice}`;
}

export function easeOutCubic(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 - (1 - k) ** 3;
}

/**
 * Glide from where the dot was shown when the target changed to where the new target
 * is now. `to` keeps moving with the phone, so the glide lands on a moving point.
 */
export function blendPosition(from: Point, to: Point, elapsedMs: number, durationMs: number): Point & { done: boolean } {
  if (durationMs <= 0 || elapsedMs >= durationMs) return { ...to, done: true };
  const k = easeOutCubic(elapsedMs / durationMs);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, done: false };
}

/** Direction for the edge arrow, in screen degrees: 0 = right, 90 = down. */
export function arrowAngleDeg(p: Point): number {
  return (Math.atan2(p.y, p.x) * 180) / Math.PI;
}

/** True when the camera points within `zoneDeg` of the target (round zone). */
export function inHoldZone(d: { dHeading: number; dPitch: number }, zoneDeg: number): boolean {
  return Math.hypot(d.dHeading, d.dPitch) <= zoneDeg;
}

/** Hold-zone radius on screen, using the same degrees-to-pixels scale as the dot. */
export function zoneRadiusPx(zoneDeg: number, viewportWidth: number, horizontalFovDeg: number): number {
  return (zoneDeg / horizontalFovDeg) * viewportWidth;
}

export function isTargetCell(target: Target | null, cell: CellRef | null): boolean {
  return !!target && !!cell && target.kind === "band" && target.slice === cell.slice && target.band === cell.band;
}

/**
 * With the hold zone on, the cell the dot points at isn't judged at all until the
 * circle is inside the zone: its dwell is suspended (not counted as bad, so it can't
 * turn yellow while being approached). Other cells passed on the way count as usual.
 */
export function suspendDwell(onTargetCell: boolean, inZone: boolean, opts: Pick<DotOptions, "holdZone">): boolean {
  return opts.holdZone && onTargetCell && !inZone;
}

/** 0–1 progress of the current good dwell, for the fill round the circle. */
export function dwellProgress(dwell: Dwell | null, now: number, dwellMs: number): number {
  if (!dwell || dwell.goodSince == null || dwellMs <= 0) return 0;
  return Math.min(1, Math.max(0, (now - dwell.goodSince) / dwellMs));
}

/** Parse ?dot=arrow,fill,smooth,zone (or none / all) into flag overrides. */
export function parseDotParam(value: string | null): Partial<DotOptions> | null {
  if (value == null) return null;
  const parts = new Set(value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const all = parts.has("all");
  return {
    edgeArrow: all || parts.has("arrow"),
    dwellFill: all || parts.has("fill"),
    smoothMove: all || parts.has("smooth"),
    holdZone: all || parts.has("zone"),
  };
}
