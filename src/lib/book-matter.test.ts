import { describe, expect, it } from "vitest";
import { matterChoices, matterLookup } from "./book-matter";
import { parseAnchor, resolveAnchor, formatAnchor, anchorLabel, splitFact, factQuotes } from "./anchors";
import { staticChips } from "./static-chips";
import { markdownToHtml } from "./markdown-doc";

const files = [
  { path: "publication/metadata.yaml", content: "title: X\nsections:\n  afterword: |\n    The gate is real.\n  book_description: |\n    A pilot waits.\n  about_author: |\n    Writes.\n" },
  { path: "backmatter/essays/01-on-gates.md", content: "---\ntitle: On Gates\n---\n\nGates open inward.\n" },
  { path: "frontmatter/01-preface.md", content: "---\ntitle: Preface\n---\n\nWhy this book.\n" },
];
const config = { publication: { back_matter: ["backmatter/essays/01-on-gates.md"], front_matter: ["frontmatter/01-preface.md"] } };

describe("matter anchors", () => {
  const matterOf = matterLookup(files, config);
  const resolve = (raw: string) => resolveAnchor(parseAnchor(raw), [], () => undefined, matterOf);

  it("parses, labels and writes them", () => {
    const a = parseAnchor("*Back matter: On Gates*: “gates open inward”");
    expect(a.matter).toBe("Back matter: On Gates");
    expect(a.quote).toBe("gates open inward");
    expect(anchorLabel(a)).toBe("On Gates");
    expect(formatAnchor({ chapters: [], matter: "Afterword", quote: "The gate" })).toBe("*Afterword*: “The gate”");
    expect(splitFact("- Real. (*Afterword*; *Ch. 2*)").anchors.map(x => x.raw)).toEqual(["*Afterword*", "*Ch. 2*"]);
  });
  it("finds metadata sections and listed matter, and checks quoted words", () => {
    expect(resolve("*Afterword*: “the gate is REAL”").status).toBe("ok");
    expect(resolve("*Afterword*: “the gate is false”").status).toBe("no-quote");
    expect(resolve("*About the author*").matter?.path).toBe("publication/metadata.yaml");
    expect(resolve("*Back matter: On Gates*").matter?.path).toBe("backmatter/essays/01-on-gates.md");
    expect(resolve("*Preface*").status).toBe("ok");
    expect(resolve("*Back matter: On Walls*").status).toBe("no-chapter");
    expect(resolve("*Introduction*").status).toBe("not-anchor");
  });
  it("offers each part once in the picker", () => {
    expect(matterChoices(files, config).map(c => c.anchor)).toEqual(["Afterword", "Book description", "About the author", "Front matter: Preface", "Back matter: On Gates"]);
  });
  it("leaves a title in italics alone in read-only views", () => {
    const ctx = { resolve: (a: ReturnType<typeof parseAnchor>) => resolveAnchor(a, [], () => undefined, matterOf) };
    const html = staticChips(markdownToHtml("- Westcott and Hort, *Introduction*, 1882. (*Afterword*)").html, ctx);
    expect(html).toContain("<em>Introduction</em>");
    expect(html).toContain('<span class="anchor-chips"><span class="anchor-chip ok"');
    expect(html).toContain(">Afterword<");
  });
});

describe("all-quote facts", () => {
  const chapters = [{ number: 2, currentPath: "m/02.md", sceneTitles: [] }, { number: 8, currentPath: "m/08.md", sceneTitles: [] }] as never;
  const text: Record<string, string> = { "m/02.md": "“It's Wednesday,” she said. “The twenty-eighth of October.” He did not say “race.”", "m/08.md": "Later." };
  const check = (line: string, own?: number) => {
    const s = splitFact(line);
    const quotes = factQuotes(s.text);
    return resolveAnchor({ ...s.anchors[0], factQuotes: quotes ?? undefined }, chapters, p => text[p], undefined, own);
  };
  it("finds the quotes of lines that are only quotation", () => {
    expect(factQuotes("- **Lines that matter:** “It's Wednesday,” … “The twenty-eighth of October.”")).toEqual(["It's Wednesday,", "The twenty-eighth of October."]);
    expect(factQuotes("  - “They’ll hold,” she said.")).toEqual(["They’ll hold,"]);
    expect(factQuotes("- Nora’s card, on birch bark: “It is resting.”")).toEqual(["It is resting."]);
    expect(factQuotes("- The old man “survived a Soviet camp” with him.")).toBeNull();
  });
  it("checks them against the anchored chapter, or the card's own", () => {
    expect(check("- “It's Wednesday,” … “The twenty-eighth of October.” (*Ch. 2*)").status).toBe("ok");
    expect(check("- “He did not say ‘race.’” (*Ch. 2*)").status).toBe("ok");
    expect(check("- “It is Thursday.” (*Ch. 2*)").status).toBe("no-quote");
    expect(check("- **Sets up / pays off:** “It's Wednesday,” (*Ch. 8*)").status).toBe("no-quote");
    expect(check("- **Sets up / pays off:** “It's Wednesday,” (*Ch. 8*)", 2).status).toBe("ok");
  });
});
