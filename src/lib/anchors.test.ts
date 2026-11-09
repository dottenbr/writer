import { describe, expect, it } from "vitest";
import { anchorLabel, findAnchors, formatAnchor, parseAnchor, resolveAnchor, splitFact } from "./anchors";
import type { ChapterInfo } from "./book-model";

describe("anchors", () => {
  it("parses chapters, scenes and quotes", () => {
    const a = parseAnchor("*Ch. 5, Scene 9*: “I was thirty-eight”");
    expect(a.refs).toEqual([{ chapters: [5], scenes: [9] }]);
    expect(a.quote).toBe("I was thirty-eight");
    expect(parseAnchor("*Chs. 5–7*").refs[0].chapters).toEqual([5, 6, 7]);
    expect(parseAnchor("*Ch. 1, Scene 5; Ch. 6*").refs).toEqual([{ chapters: [1], scenes: [5] }, { chapters: [6], scenes: [] }]);
    expect(parseAnchor("*Ch. 11, Scenes 2, 4*").refs[0].scenes).toEqual([2, 4]);
    expect(parseAnchor("*off the page*").offPage).toBe(true);
  });
  it("splits a fact from its trailing anchors", () => {
    const s = splitFact("  - Thirty-eight at the vote. (*Ch. 5, Scene 9*: “I was thirty-eight”; *Ch. 6*)");
    expect(s.text).toBe("  - Thirty-eight at the vote.");
    expect(s.anchors.map(a => anchorLabel(a))).toEqual(["Ch. 5 · Sc. 9", "Ch. 6"]);
    expect(splitFact("A sentence (with a remark).").anchors).toEqual([]);
  });
  it("finds anchors inside text", () => {
    expect(findAnchors("before (*Ch. 2*) and *off the page*").map(a => a.raw)).toEqual(["*Ch. 2*", "*off the page*"]);
  });
  it("writes anchors in the standard form", () => {
    expect(formatAnchor({ chapters: [3], scenes: [4], quote: "words" })).toBe("*Ch. 3, Scene 4*: “words”");
    expect(formatAnchor({ chapters: [5, 6, 7, 9] })).toBe("*Chs. 5–7, 9*");
    expect(formatAnchor({ chapters: [], offPage: true })).toBe("*off the page*");
  });
  it("checks anchors against the book", () => {
    const ch = (number: number, scenes: number): ChapterInfo => ({ number, title: `T${number}`, label: "", status: "", currentPath: `m/${number}.md`, currentSource: "author", started: false, authorWords: 0, referenceWords: 0, targetWords: 0, sceneTitles: Array.from({ length: scenes }, (_, i) => `Scene ${i + 1} – S${i + 1}`) });
    const chapters = [ch(1, 3), ch(2, 2)];
    const text = (p: string) => (p === "m/1.md" ? "He said: “I was *thirty-eight*,” and left." : "");
    expect(resolveAnchor(parseAnchor("*Ch. 1, Scene 2*: “I was thirty-eight”"), chapters, text)).toMatchObject({ status: "ok", sceneTitle: "S2" });
    expect(resolveAnchor(parseAnchor("*Ch. 4*"), chapters, text).status).toBe("no-chapter");
    expect(resolveAnchor(parseAnchor("*Ch. 2, Scene 5*"), chapters, text).status).toBe("no-scene");
    expect(resolveAnchor(parseAnchor("*Ch. 1*: “never said”"), chapters, text).status).toBe("no-quote");
  });
});
