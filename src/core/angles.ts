export const DEG = Math.PI / 180;

/** Wrap an angle to (-180, 180]. */
export function wrap180(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

/** Wrap an angle to [0, 360). */
export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
