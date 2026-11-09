import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { applyShelfStyle, readConfig, tidyConfig, updateConfig, KEY_ORDER } from "./book-config";

const owl = readFileSync(join(__dirname, "__fixtures__/owl.book.yaml"), "utf8");
const words = readFileSync(join(__dirname, "__fixtures__/words-given.book.yaml"), "utf8");
const keys = (yaml: string) => Object.keys(parse(yaml));

describe("book.yaml configuration", () => {
  it("reads a real book", () => {
    const c = readConfig(owl);
    expect(c).toMatchObject({ title: "The Owl at Dusk", author: "Peter S. Dubois", kind: "fiction", byline: "own-name", aiPolicy: "human-authored", styleInherit: "own", layout: "flat" });
    expect(readConfig(words).kind).toBe("nonfiction");
  });

  it("adds identity and style in bookkit's order, keeping everything else", () => {
    const next = updateConfig(owl, { kind: "fiction", byline: "pen-name", styleInherit: "shelf", style: { spelling: "american", serial_comma: true, quotes: "double", dashes: "em-closed" } });
    expect(keys(next).filter(k => KEY_ORDER.includes(k))).toEqual(KEY_ORDER.filter(k => keys(next).includes(k)));
    expect(next).toContain("author: Peter S. Dubois\nbyline: pen-name\nlanguage: en-US\nkind: fiction\n");
    const c = readConfig(next);
    expect(c).toMatchObject({ kind: "fiction", byline: "pen-name", styleInherit: "shelf", style: { spelling: "american", serial_comma: true, quotes: "double", dashes: "em-closed" } });
    // the original's comments and values are all still there
    for (const line of owl.split("\n").filter(l => l.trim().startsWith("#") || /^\s+reason:/.test(l))) expect(next).toContain(line.trim());
    expect(parse(next).companion).toEqual(parse(owl).companion);
    expect(parse(next).lint).toEqual(parse(owl).lint);
  });

  it("keeps the Vale spelling style in step with the declared spelling", () => {
    const oxford = updateConfig(owl, { style: { spelling: "oxford" } });
    expect(parse(oxford).lint.vale.styles).toEqual(["ManuscriptCore", "Prose", "OxfordSpelling", "Vale"]);
    expect(oxford).toContain("styles: [ManuscriptCore, Prose, OxfordSpelling, Vale]");
    const british = updateConfig(owl, { style: { spelling: "british" } });
    expect(parse(british).lint.vale.styles).toEqual(["ManuscriptCore", "Prose", "Vale"]);
    expect(parse(updateConfig(owl, { style: { spelling: "american" } })).lint.vale.styles).toEqual(parse(owl).lint.vale.styles);
  });

  it("keeps companion.kind in step with kind", () => {
    const next = updateConfig(words, { kind: "nonfiction", byline: "pen-name" });
    expect(parse(next).kind).toBe("nonfiction");
    expect(parse(next).companion.kind).toBe("nonfiction");
  });

  it("writes a shelf's style into books that inherit it, and leaves others alone", () => {
    const inheriting = updateConfig(owl, { styleInherit: "shelf", style: { spelling: "american", serial_comma: true } });
    const next = applyShelfStyle(inheriting, { spelling: "american", serial_comma: false, quotes: "single" });
    expect(readConfig(next).style).toEqual({ spelling: "american", serial_comma: false, quotes: "single" });
    expect(applyShelfStyle(next, { spelling: "american", serial_comma: false, quotes: "single" })).toBe(next);
    const own = updateConfig(owl, { styleInherit: "own", style: { spelling: "american" } });
    expect(applyShelfStyle(own, { spelling: "oxford" })).toBe(own);
  });

  it("tidies a file into bookkit's order without changing its content", () => {
    const messy = "manuscript:\n  dir: manuscript\n\ntitle: X\nai_policy: human-authored\nslug: x\n";
    const tidy = tidyConfig(messy);
    expect(keys(tidy)).toEqual(["slug", "title", "ai_policy", "manuscript"]);
    expect(parse(tidy)).toEqual(parse(messy));
  });
});

import { newBookFiles } from "./supabase-service";
import { policy, verifyPolicy } from "./policy-blocks";
describe("new books", () => {
  it("start with a clean book.yaml, their shelf's style and current policy copies", () => {
    const files = newBookFiles("The Long Way", "A. Writer", "2026-11-09", { spelling: "oxford", serial_comma: false });
    const c = readConfig(files["book.yaml"]);
    expect(c).toMatchObject({ kind: "fiction", byline: "own-name", aiPolicy: "human-authored", styleInherit: "shelf", style: { spelling: "oxford", serial_comma: false } });
    expect(keys(files["book.yaml"])).toEqual(KEY_ORDER.filter(k => keys(files["book.yaml"]).includes(k)));
    expect(verifyPolicy(files, policy("human-authored")!)).toEqual([]);
    expect(readConfig(newBookFiles("X", "Y")["book.yaml"]).styleInherit).toBe("own");
  });
});
