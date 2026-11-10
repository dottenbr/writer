import { describe, expect, it } from "vitest";
import { parseBookkit } from "./bookkit";
const config = 'title: Test\nmanuscript:\n  dir: manuscript\n  draft: draft\n  layout: parts\n';
const chapter = (status: string, text: string) => `---\nchapter: 1\ntitle: One\nstatus: ${status}\npart: 1\n---\n# Chapter 1\n${text}\n`;
describe("Bookkit import", () => {
  it("keeps an unfinished author's prose separate from the reference text of record", () => {
    const author = chapter("drafting", "Human words");
    const draft = chapter("drafted", "Reference words");
    const files = { "book.yaml": config, "manuscript/01-week/01-one.md": author, "draft/01-week/01-one.md": draft, "bible/canon.md": "---\nchecked: 2026-11-08\n---\nFacts" };
    const book = parseBookkit(files);
    expect(book.chapters[0].author?.raw).toBe(author);
    expect(book.chapters[0].current.raw).toBe(draft);
    expect(book.chapters[0].currentSource).toBe("reference");
    expect(Object.fromEntries(book.documents.map(d => [d.path, d.raw]))).toEqual(files);
    files["manuscript/01-week/01-one.md"] = chapter("drafted", "Human words");
    expect(parseBookkit(files).chapters[0].currentSource).toBe("author");
  });
  it("rejects missing publication material and traversal paths", () => {
    expect(() => parseBookkit({ "book.yaml": config + 'publication:\n  front_matter: [missing.md]' })).toThrow("Missing publication matter");
    expect(() => parseBookkit({ "../book.yaml": config })).toThrow("Unsafe");
  });
});
