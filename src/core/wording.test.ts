import { describe, expect, it } from "vitest";
import { skippedSentences } from "./wording";
import { initialCoverage, skipCell } from "./coverage";

describe("skippedSentences", () => {
  it("says nothing when nothing was skipped", () => {
    expect(skippedSentences(initialCoverage(12).cells)).toEqual([]);
  });

  it("matches the spec wording for one floor area", () => {
    const s = skipCell(initialCoverage(12), 3, "floor", 0).state;
    expect(skippedSentences(s.cells).join(" ")).toBe(
      "One floor area was blocked, so we skipped it. Your adjuster will see that.",
    );
  });

  it("pluralises and covers other bands", () => {
    let s = initialCoverage(12);
    s = skipCell(s, 1, "floor", 0).state;
    s = skipCell(s, 2, "floor", 0).state;
    s = skipCell(s, 5, "walls", 0).state;
    expect(skippedSentences(s.cells)).toEqual([
      "One wall area was blocked, so we skipped it.",
      "Two floor areas were blocked, so we skipped them.",
      "Your adjuster will see that.",
    ]);
  });
});
