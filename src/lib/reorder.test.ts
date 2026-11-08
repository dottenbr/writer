import { describe, expect, it } from "vitest";
import { buildBookModel } from "./book-model";
import { formatAnchor, planReorder, renumberAnchors } from "./reorder";

const BOOK: Record<string, string> = {
  "book.yaml": "title: T\nmanuscript:\n  dir: manuscript\n  draft: draft\n  layout: flat\n",
  "draft/01-one.md": "---\nchapter: 1\ntitle: One\nstatus: drafted\n---\n\n# Chapter 1\n\nDraft one.\n",
  "draft/02-two.md": "---\nchapter: 2\ntitle: Two\nstatus: drafted\n---\n\n# Chapter 2\n\nDraft two.\n",
  "draft/03-three.md": "---\nchapter: 3\ntitle: Three\nstatus: drafted\n---\n\n# Chapter 3\n\nDraft three.\n",
  "manuscript/02-two.md": "---\nchapter: 2\ntitle: Two\nstatus: drafted\n---\n\n# Chapter 2\n\nMine.\n",
  "outline/scenes/03-three.md": "---\nchecked: 2026-11-08\nchapter: 3\n---\n\n# 3. Three\n\n## Scene 1 – X\n\n- **Purpose:** sets up (*Ch. 1*).\n",
  "outline/chapters.md": "# Chapters\n\nIntro (*Chs. 1–3*).\n\n## 1. One\n\n**Purpose:** a.\n\n## 2. Two\n\n**Purpose:** b (*Ch. 3*).\n\n## 3. Three\n\n**Purpose:** c.\n",
  "bible/canon.md": "# Canon\n\n- Fact (*Ch. 3*: “words”).\n- Other (*Chs. 2, 3*).\n- Untouched (*Ch. 1*).\n",
};
const files = Object.entries(BOOK).map(([path, content]) => ({ path, content, loaded: true }));

describe("chapter reordering", () => {
  it("formats anchors like bookkit", () => {
    expect(formatAnchor("Chs.", [5, 3, 4, 9])).toBe("Chs. 3–5, 9");
    expect(formatAnchor("Ch.", [7])).toBe("Ch. 7");
    expect(renumberAnchors("see *Ch. 3* and *Chs. 2–3*", new Map([[3, 2], [2, 3]]))).toBe("see *Ch. 2* and *Chs. 2–3*");
  });

  it("moves chapter 3 before chapter 2 consistently", () => {
    const model = buildBookModel(files);
    const plan = planReorder(model, files, [1, 3, 2]);
    expect([...plan.mapping]).toEqual([[3, 2], [2, 3]]);
    const out = new Map(plan.writes.map(w => [w.path, w.content]));
    expect(out.get("draft/02-three.md")).toBe("---\nchapter: 2\ntitle: Three\nstatus: drafted\n---\n\n# Chapter 2\n\nDraft three.\n");
    expect(out.get("draft/03-two.md")).toContain("chapter: 3");
    expect(out.get("manuscript/03-two.md")).toBe("---\nchapter: 3\ntitle: Two\nstatus: drafted\n---\n\n# Chapter 3\n\nMine.\n");
    expect(out.get("outline/scenes/02-three.md")).toContain("# 2. Three");
    expect(out.get("outline/chapters.md")).toBe("# Chapters\n\nIntro (*Chs. 1–3*).\n\n## 1. One\n\n**Purpose:** a.\n\n## 2. Three\n\n**Purpose:** c.\n\n## 3. Two\n\n**Purpose:** b (*Ch. 2*).\n");
    expect(out.get("bible/canon.md")).toBe("# Canon\n\n- Fact (*Ch. 2*: “words”).\n- Other (*Chs. 2–3*).\n- Untouched (*Ch. 1*).\n");
    expect(plan.deletes.sort()).toEqual(["draft/02-two.md", "draft/03-three.md", "manuscript/02-two.md", "outline/scenes/03-three.md"]);
    // the result is a valid book again
    const after = new Map(files.map(f => [f.path, f.content]));
    plan.deletes.forEach(p => after.delete(p));
    plan.writes.forEach(w => after.set(w.path, w.content));
    const next = buildBookModel([...after].map(([path, content]) => ({ path, content, loaded: true })));
    expect(next.chapters.map(c => c.title)).toEqual(["One", "Three", "Two"]);
  });

  it("does nothing when the order is unchanged and rejects incomplete orders", () => {
    const model = buildBookModel(files);
    expect(planReorder(model, files, [1, 2, 3]).writes).toEqual([]);
    expect(() => planReorder(model, files, [1, 2])).toThrow();
  });
});
