import { describe, expect, it } from "vitest";
import { addSection, entryOps, findSection, removeSection, renameSection, replaceSectionBody, sectionBody, sectionFields } from "./entity-section";
import { buildBookModel } from "./book-model";
import { routeToUrl, urlToRoute, viewForPath, bookSlug, bookIdForSlug, FULL_PAGE } from "./book-url";

const PAGE = "---\nchecked: 2026-11-08\n---\n\n# Characters\n\nIntro.\n\n## Nora\n\n- **Role:** herder.\n- **Age:** young.\n\nMore about Nora.\n\n## The Owl\n\n```\n## not a heading\n```\n\n## Minor characters\n\nVarious.\n";

describe("entity sections", () => {
  it("finds a section by slug, ignoring headings in code fences", () => {
    expect(sectionBody(PAGE, "nora")).toBe("- **Role:** herder.\n- **Age:** young.\n\nMore about Nora.");
    expect(sectionBody(PAGE, "the-owl")).toBe("```\n## not a heading\n```");
    expect(findSection(PAGE, "missing")).toBeNull();
  });

  it("replaces only that section's body", () => {
    const next = replaceSectionBody(PAGE, "nora", "- **Role:** goat-girl.\n");
    expect(next).toContain("## Nora\n\n- **Role:** goat-girl.\n\n## The Owl");
    expect(next.replace("- **Role:** goat-girl.\n", "- **Role:** herder.\n- **Age:** young.\n\nMore about Nora.\n")).toBe(PAGE);
    const last = replaceSectionBody(PAGE, "minor-characters", "Many.");
    expect(last.endsWith("## Minor characters\n\nMany.\n")).toBe(true);
  });

  it("renames, removes and adds sections", () => {
    expect(renameSection(PAGE, "nora", "Nora Brandt")).toContain("## Nora Brandt\n\n- **Role:** herder.");
    expect(removeSection(PAGE, "the-owl")).not.toContain("The Owl");
    const added = addSection(PAGE, "Tobi");
    expect(added.indexOf("## Tobi")).toBeLessThan(added.indexOf("## Minor characters"));
    expect(addSection("# Places\n\n## Ennet\n\nA village.\n", "The pass")).toBe("# Places\n\n## Ennet\n\nA village.\n\n## The pass\n\n");
  });

  it("reads field lines", () => {
    expect(sectionFields(sectionBody(PAGE, "nora")!)).toEqual([{ label: "Role", value: "herder." }, { label: "Age", value: "young." }]);
  });
});

describe("book URLs", () => {
  const files = [
    { path: "book.yaml", content: "title: Owl\nmanuscript:\n  dir: manuscript\n  draft: draft\n", loaded: true },
    { path: "draft/01-storm.md", content: "---\nchapter: 1\ntitle: Storm\nstatus: drafted\n---\n\n# Chapter 1\n\nText.\n", loaded: true },
    { path: "manuscript/02-back.md", content: "---\nchapter: 2\ntitle: Back\nstatus: drafting\n---\n\n# Chapter 2\n\n", loaded: true },
    { path: "bible/characters.md", content: PAGE, loaded: true },
    { path: "bible/timeline.md", content: "# Timeline\n\n## Spring\n\nx\n", loaded: true },
    { path: "outline/chapters.md", content: "# Chapters\n\n## 1. Storm\n", loaded: true },
    { path: "craft/style-guide.md", content: "# Style\n", loaded: true },
  ];
  const model = buildBookModel(files);
  const round = (view: any, path: string, anchor?: string) => {
    const url = routeToUrl("owl", { view, path, anchor }, model);
    const [pathname, hash = ""] = url.split("#");
    return { url, back: urlToRoute(pathname, hash ? "#" + hash : "", model) };
  };

  it("gives every place a readable address that resolves back", () => {
    expect(round("write", "").url).toBe("/owl");
    expect(round("write", "draft/01-storm.md")).toEqual({ url: "/owl/chapter/1", back: { view: "write", path: "draft/01-storm.md" } });
    expect(round("write", "manuscript/02-back.md").url).toBe("/owl/chapter/2");
    expect(round("plan", "").url).toBe("/owl/plan");
    expect(round("plan", "@brief")).toEqual({ url: "/owl/brief", back: { view: "plan", path: "@brief" } });
    expect(round("plan", "outline/chapters.md")).toEqual({ url: "/owl/outline/chapters", back: { view: "plan", path: "outline/chapters.md" } });
    expect(round("bible", "").url).toBe("/owl/bible");
    expect(round("bible", "bible/characters.md")).toEqual({ url: "/owl/bible/characters", back: { view: "bible", path: "bible/characters.md" } });
    expect(round("bible", "bible/characters.md", "nora")).toEqual({ url: "/owl/bible/characters/nora", back: { view: "bible", path: "bible/characters.md", anchor: "nora" } });
    expect(round("bible", "bible/characters.md", FULL_PAGE)).toEqual({ url: "/owl/bible/characters/full-page", back: { view: "bible", path: "bible/characters.md", anchor: FULL_PAGE } });
    expect(round("bible", "bible/timeline.md", "spring")).toEqual({ url: "/owl/bible/timeline#spring", back: { view: "bible", path: "bible/timeline.md", anchor: "spring" } });
    expect(round("write", "craft/style-guide.md").url).toBe("/owl/craft/style-guide");
    expect(round("write", "book.yaml")).toEqual({ url: "/owl/file/book.yaml", back: { view: "write", path: "book.yaml" } });
    expect(round("inspiration", "").url).toBe("/owl/inspiration");
  });

  it("puts each page in its view", () => {
    expect(viewForPath("bible/places.md")).toBe("bible");
    expect(viewForPath("outline/scenes/01-storm.md")).toBe("plan");
    expect(viewForPath("@brief")).toBe("plan");
    expect(viewForPath("research/x.md")).toBe("write");
  });

  it("names books by title and tells same-titled books apart", () => {
    const catalog = [{ id: "aaaaaaaa-1", name: "The Owl at Dusk" }, { id: "bbbbbbbb-2", name: "Draft" }, { id: "cccccccc-3", name: "Draft" }];
    expect(bookSlug(catalog, "aaaaaaaa-1")).toBe("the-owl-at-dusk");
    expect(bookSlug(catalog, "bbbbbbbb-2")).toBe("draft-bbbbbbbb");
    expect(bookIdForSlug(catalog, "draft-cccccccc")).toBe("cccccccc-3");
    expect(bookIdForSlug(catalog, "the-owl-at-dusk")).toBe("aaaaaaaa-1");
  });
});

describe("bullet entries", () => {
  const MOTIFS = "# Motifs\n\nRefrains.\n\n- **Counting.** Nora counts the goats (*Ch. 1*).\n- **“How do you know?”** Her question (*Ch. 1*);\n  the Owl’s question (*Ch. 2*).\n- **Red ribbon:** her only one.\n\nClosing note.\n";
  const ops = entryOps("bullet");
  it("reads entries written as bold-named bullets", async () => {
    const { bulletEntries } = await import("./book-model");
    expect(bulletEntries(MOTIFS).map(b => b.name)).toEqual(["Counting", "“How do you know?”", "Red ribbon"]);
    expect(ops.body(MOTIFS, "how-do-you-know")).toBe("Her question (*Ch. 1*);\nthe Owl’s question (*Ch. 2*).");
  });
  it("edits, renames, removes and adds one bullet, keeping the rest byte for byte", () => {
    const edited = ops.replace(MOTIFS, "counting", "Nora counts everything.");
    expect(edited).toBe(MOTIFS.replace("Nora counts the goats (*Ch. 1*).", "Nora counts everything."));
    expect(ops.rename(MOTIFS, "red-ribbon", "The red ribbon")).toContain("- **The red ribbon:** her only one.");
    expect(ops.remove(MOTIFS, "how-do-you-know")).toBe("# Motifs\n\nRefrains.\n\n- **Counting.** Nora counts the goats (*Ch. 1*).\n- **Red ribbon:** her only one.\n\nClosing note.\n");
    expect(ops.add(MOTIFS, "Snow")).toContain("- **Red ribbon:** her only one.\n- **Snow:**\n\nClosing note.");
  });
});
