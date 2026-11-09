import { describe, expect, it } from "vitest";
import { readIdentity, setIdentity, setTopLevel } from "./book-yaml";

const OWL = "# comment\nslug: the-owl\ntitle: The Owl\nauthor: Peter S. Dubois\nlanguage: en-US\n\nai_policy: human-authored\n\nmanuscript:\n  dir: manuscript\n";
const WORDS = "slug: words\ntitle: Words Given\nauthor: Samuel Matthis\nlanguage: en-US\n\nai_policy: human-authored\n\ncompanion:\n  standard: 1\n  kind: nonfiction\n  retired: []\n";

describe("book.yaml identity", () => {
  it("reads bookkit's defaults and the older companion.kind", () => {
    expect(readIdentity(OWL)).toEqual({ kind: "fiction", byline: "own-name" });
    expect(readIdentity(WORDS)).toEqual({ kind: "nonfiction", byline: "own-name" });
  });
  it("adds kind and byline after language, leaving the rest untouched", () => {
    const next = setIdentity(OWL, { kind: "fiction", byline: "pen-name" });
    expect(next).toBe(OWL.replace("language: en-US\n", "language: en-US\nkind: fiction\nbyline: pen-name\n"));
    expect(readIdentity(next)).toEqual({ kind: "fiction", byline: "pen-name" });
    expect(setIdentity(next, { byline: "own-name" })).toBe(next.replace("byline: pen-name", "byline: own-name"));
  });
  it("keeps companion.kind in step with the top-level kind", () => {
    const next = setIdentity(WORDS, { kind: "fiction" });
    expect(next).toContain("language: en-US\nkind: fiction\n");
    expect(next).toContain("  kind: fiction\n  retired: []");
    expect(readIdentity(next).kind).toBe("fiction");
  });
  it("replaces an existing top-level key in place", () => {
    expect(setTopLevel("title: X\nkind: fiction\nlanguage: en\n", "kind", "nonfiction")).toBe("title: X\nkind: nonfiction\nlanguage: en\n");
  });
});
