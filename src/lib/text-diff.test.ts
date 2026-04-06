import { describe, expect, it } from "vitest";
import { buildWordDiff } from "./text-diff";

describe("buildWordDiff", () => {
  it("keeps unchanged text as a same segment", () => {
    expect(buildWordDiff("same text", "same text")).toEqual([
      { type: "same", value: "same text" },
    ]);
  });

  it("isolates inserted words while preserving surrounding whitespace", () => {
    expect(buildWordDiff("alpha gamma", "alpha beta gamma")).toEqual([
      { type: "same", value: "alpha" },
      { type: "added", value: " beta" },
      { type: "same", value: " gamma" },
    ]);
  });

  it("falls back to replace mode for very large inputs", () => {
    const before = Array.from({ length: 450 }, (_, index) => `before-${index}`).join(" ");
    const after = Array.from({ length: 450 }, (_, index) => `after-${index}`).join(" ");

    expect(buildWordDiff(before, after)).toEqual([
      { type: "removed", value: before },
      { type: "added", value: after },
    ]);
  });
});
