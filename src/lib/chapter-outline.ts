/**
 * One chapter's section of `outline/chapters.md` ("## 3. The crossing"),
 * edited on its own while the outline stays one file.
 */
import { slugify } from "./book-model";
import { replaceSectionBody, sectionBody } from "./entity-section";

export const OUTLINE_PATH = "outline/chapters.md";

interface HeadingLine { offset: number; title: string; number?: number }

function level2Headings(text: string): HeadingLine[] {
  const out: HeadingLine[] = [];
  let offset = 0;
  let fence = false;
  let frontMatter = /^---\r?\n/.test(text);
  let lineNo = 0;
  for (const line of text.split("\n")) {
    if (frontMatter && lineNo > 0 && /^---\s*$/.test(line)) frontMatter = false;
    else if (!frontMatter) {
      if (/^(```|~~~)/.test(line)) fence = !fence;
      const m = !fence && line.match(/^##\s+(.*?)\s*#*\s*$/);
      if (m) {
        const n = m[1].match(/^(\d+)(?:[.:)\s]|$)/);
        out.push({ offset, title: m[1], number: n ? Number(n[1]) : undefined });
      }
    }
    offset += line.length + 1;
    lineNo++;
  }
  return out;
}

/** Slug of the chapter's heading in the outline, if it has one. */
export function chapterSectionSlug(text: string, chapter: number): string | null {
  const h = level2Headings(text).find(x => x.number === chapter);
  return h ? slugify(h.title.replace(/[*_`]/g, "")) : null;
}

/** The chapter's plan without its heading, or null when the outline has no section for it. */
export function chapterPlanBody(text: string, chapter: number): string | null {
  const slug = chapterSectionSlug(text, chapter);
  return slug ? sectionBody(text, slug) : null;
}

export function replaceChapterPlan(text: string, chapter: number, body: string): string {
  const slug = chapterSectionSlug(text, chapter);
  return slug ? replaceSectionBody(text, slug, body) : text;
}

/** Add "## N. Title" in chapter order (before the first later chapter), with a starting body. */
export function addChapterPlan(text: string, chapter: number, title: string, body = "**Purpose:** "): string {
  if (chapterSectionSlug(text, chapter)) return text;
  const section = `## ${chapter}. ${title.trim() || `Chapter ${chapter}`}\n\n${body.trimEnd()}\n`;
  const later = level2Headings(text).find(h => h.number != null && h.number > chapter);
  if (later) return text.slice(0, later.offset) + section + "\n" + text.slice(later.offset);
  const base = text.replace(/\s+$/, "");
  return (base ? base + "\n\n" : "# Chapter outline\n\n") + section;
}

/** A new outline file holding just this chapter. */
export function newOutlineFile(chapter: number, title: string): string {
  return addChapterPlan("", chapter, title);
}
