import { BANDS, type Band, type CellState } from "./coverage";

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

const BAND_NOUN: Record<Band, string> = { ceiling: "ceiling", walls: "wall", floor: "floor" };

/**
 * Plain sentences about skipped cells for the "Room captured" screen, e.g.
 * "One floor area was blocked, so we skipped it. Your adjuster will see that."
 */
export function skippedSentences(cells: CellState[]): string[] {
  const perBand: Record<Band, number> = { ceiling: 0, walls: 0, floor: 0 };
  cells.forEach((s, i) => {
    if (s === "skipped") perBand[BANDS[i % 3]]++;
  });
  const parts = BANDS.filter((b) => perBand[b] > 0).map((b) => {
    const n = perBand[b];
    const count = NUMBER_WORDS[n] ?? String(n);
    return n === 1
      ? `${count} ${BAND_NOUN[b]} area was blocked, so we skipped it.`
      : `${count} ${BAND_NOUN[b]} areas were blocked, so we skipped them.`;
  });
  if (parts.length === 0) return [];
  return [...parts, "Your adjuster will see that."];
}
