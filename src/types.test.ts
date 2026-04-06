import { describe, expect, it } from "vitest";
import { deriveChapterNumbers, formatSectionHeading, formatSectionLabel, formatSectionPrefix } from "./types";

describe("section helpers", () => {
  it("numbers only chapter sections", () => {
    const chapters = [
      { id: "pro", sectionType: "prologue" },
      { id: "c1", sectionType: "chapter" },
      { id: "c2", sectionType: "chapter" },
      { id: "epi", sectionType: "epilogue" },
      { id: "c3", sectionType: "chapter" },
    ];

    const numbers = deriveChapterNumbers(chapters as any);

    expect(numbers.get("pro")).toBeUndefined();
    expect(numbers.get("c1")).toBe(1);
    expect(numbers.get("c2")).toBe(2);
    expect(numbers.get("epi")).toBeUndefined();
    expect(numbers.get("c3")).toBe(3);
  });

  it("formats chapter and non-chapter headings consistently", () => {
    expect(formatSectionHeading("chapter", 7, "Glass Houses")).toBe("Chapter 7 — Glass Houses");
    expect(formatSectionHeading("authors_note", null, "")).toBe("Author's Note");
    expect(formatSectionLabel("chapter", 2)).toBe("Chapter 2");
    expect(formatSectionPrefix("authors_note", null)).toBe("A.N.");
  });
});
