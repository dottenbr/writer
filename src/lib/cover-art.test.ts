import { describe, expect, it } from "vitest";
import {
  analyzeCoverPixels,
  applyCoverTags,
  dailyInspirationIndex,
  inverseTextColorForTone,
  isImageFile,
  nextShuffleIndex,
  pickBookCoverItem,
  visibleInspirationTags,
} from "./cover-art";

describe("cover-art utilities", () => {
  it("picks a deterministic mood-board image per calendar day and book", () => {
    const idx1 = dailyInspirationIndex("2026-11-09", "proj-1", 22);
    const idx2 = dailyInspirationIndex("2026-11-09", "proj-1", 22);
    expect(idx1).toBe(idx2);
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(22);

    // Different days vary across the board
    const days = new Set(
      Array.from({ length: 14 }, (_, i) =>
        dailyInspirationIndex(`2026-11-${String(i + 1).padStart(2, "0")}`, "proj-1", 22)
      )
    );
    expect(days.size).toBeGreaterThan(3);
  });

  it("shuffles to a different mood-board image when more than one exists", () => {
    for (let current = 0; current < 10; current++) {
      const next = nextShuffleIndex(current, 10, () => 0);
      expect(next).not.toBe(current);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(10);
    }
    expect(nextShuffleIndex(0, 1)).toBe(0);
  });

  it("computes inverse text color: black (#141312) on light cover art and white (#ffffff) on dark cover art", () => {
    // Light canvas (4x4 near-white pixels)
    const lightPixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < lightPixels.length; i += 4) {
      lightPixels[i] = 240;
      lightPixels[i + 1] = 236;
      lightPixels[i + 2] = 228;
      lightPixels[i + 3] = 255;
    }
    const light = analyzeCoverPixels(lightPixels, 4, 4);
    expect(light.tone).toBe("light");
    expect(light.textColor).toBe("#141312");
    expect(inverseTextColorForTone("light")).toBe("#141312");

    // Dark canvas (4x4 deep charcoal/indigo pixels)
    const darkPixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < darkPixels.length; i += 4) {
      darkPixels[i] = 24;
      darkPixels[i + 1] = 28;
      darkPixels[i + 2] = 38;
      darkPixels[i + 3] = 255;
    }
    const dark = analyzeCoverPixels(darkPixels, 4, 4);
    expect(dark.tone).toBe("dark");
    expect(dark.textColor).toBe("#ffffff");
    expect(inverseTextColorForTone("dark")).toBe("#ffffff");
  });

  it("manages cover tags and selects explicit cover item before fallback art", () => {
    expect(isImageFile("painting.jpg")).toBe(true);
    expect(isImageFile("notes.pdf")).toBe(false);

    const tags = applyCoverTags(["art", "painting"], true, "light");
    expect(tags).toEqual(["art", "painting", "cover", "cover-light"]);
    expect(visibleInspirationTags(tags)).toEqual(["art", "painting"]);

    const items = [
      { id: "1", fileName: "doc.pdf", tags: ["reference"] },
      { id: "2", fileName: "first.jpg", tags: ["art"] },
      { id: "3", fileName: "chosen.png", tags: ["art", "cover", "cover-light"] },
    ];
    const picked = pickBookCoverItem(items);
    expect(picked?.item.id).toBe("3");
    expect(picked?.explicit).toBe(true);
    expect(picked?.tone).toBe("light");

    const fallback = pickBookCoverItem(items.slice(0, 2));
    expect(fallback?.item.id).toBe("2");
    expect(fallback?.explicit).toBe(false);
  });
});
