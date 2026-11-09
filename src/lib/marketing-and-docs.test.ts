import { describe, expect, it } from "vitest";
import { parsePublicLocation } from "./public-routes";
import { validateLibrarySlug, RESERVED_LIBRARY_SLUGS } from "./supabase-service";
import { DOC_CATEGORIES, DOC_PAGES, getAdjacentDocPages, getDocPage, searchDocs } from "./docs-content";
import { HOUSE_STYLE_PRESETS } from "../components/marketing/SignUpFlow";

describe("public routing (Marketing, Docs, SignUp, Login, App)", () => {
  it("routes unauthenticated visitors on the root domain to the marketing site", () => {
    expect(parsePublicLocation("/", "", "", false, false)).toEqual({
      kind: "marketing",
    });
  });

  it("routes authenticated visitors on the root domain to the app workspace", () => {
    expect(parsePublicLocation("/", "", "", true, false)).toEqual({
      kind: "app",
    });
  });

  it("routes unauthenticated visitors on a library subdomain to login", () => {
    expect(parsePublicLocation("/", "", "", false, true)).toEqual({
      kind: "login",
    });
  });

  it("routes /marketing, /features, and /pricing to the marketing site even when signed in", () => {
    expect(parsePublicLocation("/marketing", "", "", true, false).kind).toBe("marketing");
    expect(parsePublicLocation("/features", "", "", true, false).kind).toBe("marketing");
    expect(parsePublicLocation("/pricing", "", "", false, false).kind).toBe("marketing");
  });

  it("routes /docs and /docs/<slug> to the Docusaurus-style documentation viewer", () => {
    expect(parsePublicLocation("/docs", "", "", false, false)).toEqual({
      kind: "docs",
      slug: "introduction",
    });
    expect(parsePublicLocation("/docs/libraries-and-shelves", "", "", true, false)).toEqual({
      kind: "docs",
      slug: "libraries-and-shelves",
    });
  });

  it("routes /signup, /subscribe, and /start to the free subscription & library setup flow", () => {
    expect(parsePublicLocation("/signup", "", "", false, false).kind).toBe("signup");
    expect(parsePublicLocation("/subscribe", "", "", true, false).kind).toBe("signup");
    expect(parsePublicLocation("/start", "", "", false, false).kind).toBe("signup");
  });
});

describe("library slug validation & house style presets", () => {
  it("accepts valid lowercase slugs and rejects reserved or malformed slugs", () => {
    expect(validateLibrarySlug("clara-vance")).toBeNull();
    expect(validateLibrarySlug("heidi")).toBeNull();
    expect(validateLibrarySlug("-bad-")).not.toBeNull();
    expect(validateLibrarySlug("Invalid_Slug")).not.toBeNull();
    for (const reserved of ["www", "api", "docs", "admin", "bookkit"]) {
      expect(RESERVED_LIBRARY_SLUGS.has(reserved)).toBe(true);
      expect(validateLibrarySlug(reserved)).toContain("reserved");
    }
  });

  it("defines complete house style presets for shelves", () => {
    expect(Object.keys(HOUSE_STYLE_PRESETS).length).toBeGreaterThanOrEqual(5);
    expect(HOUSE_STYLE_PRESETS.chicago.style).toEqual({
      spelling: "american",
      serial_comma: true,
      quotes: "double",
      punctuation_in_quotes: "american",
      dashes: "em-closed",
      ellipsis: "character",
      numbers: "words-to-hundred",
      manual: "chicago",
    });
  });
});

describe("Docusaurus-style documentation catalog & search", () => {
  it("covers all categories and links previous/next pages sequentially", () => {
    expect(DOC_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(DOC_PAGES.length).toBeGreaterThanOrEqual(12);

    const intro = getDocPage("introduction");
    expect(intro.slug).toBe("introduction");
    const adjIntro = getAdjacentDocPages("introduction");
    expect(adjIntro.prev).toBeNull();
    expect(adjIntro.next?.slug).toBe("quickstart");

    const libDoc = getDocPage("libraries-and-shelves");
    expect(libDoc.title).toContain("Libraries");
    const adjLib = getAdjacentDocPages("libraries-and-shelves");
    expect(adjLib.prev?.slug).toBe("quickstart");
    expect(adjLib.next?.slug).toBe("manuscript-editor");
  });

  it("searches across titles, headings, and prose blocks", () => {
    const shelfHits = searchDocs("shelves");
    expect(shelfHits.some((p) => p.slug === "libraries-and-shelves")).toBe(true);

    const policyHits = searchDocs("human-authored");
    expect(policyHits.some((p) => p.slug === "ai-policies")).toBe(true);
  });
});
