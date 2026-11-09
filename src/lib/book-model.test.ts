import { describe, expect, it } from "vitest";
import { anchorNumbers, buildBookModel, citedChapters, entityMatcher, mentionsIn, startChapterContent } from "./book-model";
import { parseBookkit } from "./bookkit";
import { newBookFiles } from "./supabase-service";

const files = (map: Record<string, string>) => Object.entries(map).map(([path, content]) => ({ path, content, loaded: true }));

const BOOK = {
  "book.yaml": "title: Cold Solder\nauthor: P. Dubois\nmanuscript:\n  dir: manuscript\n  draft: draft\n  layout: flat\n  front_matter:\n    required: [chapter, title, status]\n    optional: [anchor, draft_budget_words]\n",
  "draft/01-solder-paste.md": "---\nchapter: 1\ntitle: \"Solder Paste\"\nstatus: revised\ndraft_budget_words: 3000\nanchor: x\n---\n\n# Chapter 1\nJim opened the door. Eva Heller waited. Niko called.\n",
  "draft/02-japan.md": "---\nchapter: 2\ntitle: Japan\nstatus: revised\n---\n\n# Chapter 2\nJim flew east.\n",
  "manuscript/02-japan.md": "---\nchapter: 2\ntitle: Japan\nstatus: drafted\n---\n\n# Chapter 2\nMy own words about Japan.\n",
  "bible/characters.md": "---\nchecked: 2026-11-08\n---\n\n# Characters\n\n## Joachim “Jim” Heller\n\n- **Role:** narrator (*Chs. 1–2*).\n\n## Eva Heller\n\n- **Role:** his wife (*Ch. 1*: “waited”).\n\n## Niko Brandt\n\nProduction manager.\n\n## Minor characters\n\nVarious.\n",
  "outline/chapters.md": "# Chapters\n\n## 1. Solder Paste\n\n**Purpose:** establish Jim.\n\n## 2. Japan\n\n**Purpose:** go east.\n",
  "outline/scenes/01-solder-paste.md": "---\nchapter: 1\n---\n\n# 1. Solder Paste\n\n## Scene 1 – The fridge\n\n- **Purpose:** open.\n",
};

describe("book model", () => {
  const model = buildBookModel(files(BOOK));

  it("pairs author chapters with the reference draft", () => {
    expect(model.chapters.map(c => [c.number, c.currentSource, c.title])).toEqual([[1, "reference", "Solder Paste"], [2, "author", "Japan"]]);
    expect(model.chapters[0].purpose).toBe("establish Jim.");
    expect(model.chapters[0].sceneTitles).toEqual(["Scene 1 – The fridge"]);
    expect(model.chapters[1].authorWords).toBe(5);
  });

  it("extracts linkable bible entries without ambiguous family names", () => {
    const names = model.entities.map(e => e.name);
    expect(names).toEqual(["Joachim “Jim” Heller", "Eva Heller", "Niko Brandt", "Minor characters"]);
    const jim = model.entities[0];
    expect(jim.aliases).toContain("Jim");
    expect(jim.aliases).not.toContain("Heller");
    expect(model.entities[3].aliases).toEqual([]);
    const m = mentionsIn("Jim opened the door. Eva Heller waited. Niko called.", entityMatcher(model.entities));
    expect([...m.keys()].length).toBe(3);
  });

  it("reads chapter anchors", () => {
    expect(anchorNumbers("1–2, 5, 7")).toEqual([1, 2, 5, 7]);
    expect(citedChapters(BOOK["bible/characters.md"]).sort()).toEqual([1, 2]);
  });

  it("starts an author chapter with structural front matter only", () => {
    const content = startChapterContent(BOOK["draft/01-solder-paste.md"], model.config);
    expect(content).toBe("---\nchapter: 1\ntitle: \"Solder Paste\"\nstatus: drafting\nanchor: x\n---\n\n# Chapter 1\n\n");
    expect(content).not.toContain("Jim opened");
  });

  it("lays out a new chapter in its scenes, without words", () => {
    const flat = startChapterContent(BOOK["draft/01-solder-paste.md"], model.config, ["Scene 1 – A", "Scene 2 – B", "Scene 3 – C"]);
    expect(flat.endsWith("# Chapter 1\n\n***\n\n***\n\n")).toBe(true);
    const titled = startChapterContent(BOOK["draft/01-solder-paste.md"], { ...model.config, manuscript: { ...model.config.manuscript, scenes: true } }, ["Scene 1 – A", "Scene 2 – B"]);
    expect(titled.endsWith("# Chapter 1\n\n## Scene 1 – A\n\n## Scene 2 – B\n\n")).toBe(true);
    expect(startChapterContent(BOOK["draft/01-solder-paste.md"], model.config, ["Scene 1 – A"]).endsWith("# Chapter 1\n\n")).toBe(true);
  });

  it("creates new books that pass Bookkit validation", () => {
    const book = parseBookkit(newBookFiles("The Long Way", "A. Writer", "2026-11-08"));
    expect(book.config.title).toBe("The Long Way");
    expect(book.chapters).toHaveLength(1);
    const m = buildBookModel(files(newBookFiles("The Long Way", "A. Writer")));
    expect(m.companions.map(d => d.title)).toContain("Characters");
  });
});

import { manuscriptText } from "./export-book";
describe("manuscript export", () => {
  it("joins chapters in order as Markdown and plain text", () => {
    const f = files(BOOK);
    const model = buildBookModel(f);
    const md = manuscriptText(model, f, { authorOnly: false, plain: false });
    expect(md.indexOf("## 1. Solder Paste")).toBeLessThan(md.indexOf("## 2. Japan"));
    expect(md).toContain("My own words about Japan.");
    expect(md).not.toContain("Jim flew east.");
    const txt = manuscriptText(model, f, { authorOnly: true, plain: true });
    expect(txt).toContain("CHAPTER 2\nJapan");
    expect(txt).not.toContain("Jim opened the door");
  });
});
