import { describe, expect, it } from "vitest";
import { addChapterPlan, chapterPlanBody, newOutlineFile, replaceChapterPlan } from "./chapter-outline";

const outline = `# Chapter outline

Intro text.

## 1. Arrival

**Purpose:** Meet Nora.

## 3. The crossing

**Purpose:** Cross the river.
`;

describe("chapter outline sections", () => {
  it("reads one chapter's plan", () => {
    expect(chapterPlanBody(outline, 1)).toBe("**Purpose:** Meet Nora.");
    expect(chapterPlanBody(outline, 2)).toBeNull();
  });

  it("replaces only that chapter's plan, byte-for-byte elsewhere", () => {
    const next = replaceChapterPlan(outline, 1, "**Purpose:** Meet Nora at the gate.");
    expect(next).toBe(outline.replace("Meet Nora.", "Meet Nora at the gate."));
  });

  it("adds a missing chapter in order", () => {
    const next = addChapterPlan(outline, 2, "The road");
    expect(next.indexOf("## 2. The road")).toBeGreaterThan(next.indexOf("## 1. Arrival"));
    expect(next.indexOf("## 2. The road")).toBeLessThan(next.indexOf("## 3. The crossing"));
    expect(chapterPlanBody(next, 2)).toBe("**Purpose:**");
    expect(chapterPlanBody(next, 3)).toBe("**Purpose:** Cross the river.");
  });

  it("appends after the last chapter and starts a new file", () => {
    expect(addChapterPlan(outline, 4, "Home").endsWith("## 4. Home\n\n**Purpose:**\n")).toBe(true);
    expect(newOutlineFile(1, "Arrival")).toBe("# Chapter outline\n\n## 1. Arrival\n\n**Purpose:**\n");
  });
});
