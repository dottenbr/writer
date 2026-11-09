/**
 * One "## Name" section of a bible page (a character, a place…), edited on
 * its own while the page stays one file.
 */
import { slugify } from "./book-model";

export interface SectionRange {
  /** Offset of the "## " line. */
  start: number;
  /** Offset just after the heading line. */
  bodyStart: number;
  /** Offset of the next heading of level 1–2, or the end of the text. */
  end: number;
  heading: string;
}

function headingLines(text: string): Array<{ offset: number; level: number; title: string; length: number }> {
  const out: Array<{ offset: number; level: number; title: string; length: number }> = [];
  let offset = 0;
  let fence = false;
  let inFrontMatter = text.startsWith("---\n") || text.startsWith("---\r\n");
  let lineNo = 0;
  for (const line of text.split("\n")) {
    if (inFrontMatter && lineNo > 0 && /^---\s*$/.test(line)) inFrontMatter = false;
    else if (!inFrontMatter) {
      if (/^(```|~~~)/.test(line)) fence = !fence;
      const m = !fence && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) out.push({ offset, level: m[1].length, title: m[2], length: line.length });
    }
    offset += line.length + 1;
    lineNo++;
  }
  return out;
}

export function findSection(text: string, slug: string): SectionRange | null {
  const heads = headingLines(text);
  const i = heads.findIndex(h => h.level === 2 && slugify(h.title.replace(/[*_`]/g, "")) === slug);
  if (i < 0) return null;
  const h = heads[i];
  const next = heads.slice(i + 1).find(n => n.level <= 2);
  const bodyStart = Math.min(text.length, h.offset + h.length + 1);
  return { start: h.offset, bodyStart, end: next ? next.offset : text.length, heading: h.title };
}

/** The section's Markdown without its heading. */
export function sectionBody(text: string, slug: string): string | null {
  const r = findSection(text, slug);
  return r ? text.slice(r.bodyStart, r.end).replace(/^\n+/, "").replace(/\s+$/, "") : null;
}

/** Replace the section's body, keeping one blank line around it. */
export function replaceSectionBody(text: string, slug: string, body: string): string {
  const r = findSection(text, slug);
  if (!r) return text;
  const isLast = r.end >= text.length;
  const trimmed = body.replace(/^\n+/, "").replace(/\s+$/, "");
  const middle = (trimmed ? "\n" + trimmed + "\n" : "\n") + (isLast ? "" : "\n");
  return text.slice(0, r.bodyStart) + middle + text.slice(r.end);
}

/** Rename a section's heading. */
export function renameSection(text: string, slug: string, name: string): string {
  const r = findSection(text, slug);
  if (!r) return text;
  return text.slice(0, r.start) + "## " + name.trim() + "\n" + text.slice(r.bodyStart);
}

/** Remove a section, heading and all. */
export function removeSection(text: string, slug: string): string {
  const r = findSection(text, slug);
  if (!r) return text;
  return (text.slice(0, r.start) + text.slice(r.end)).replace(/\n{3,}/g, "\n\n");
}

/**
 * Add a new "## Name" section: before a trailing catch-all section such as
 * "Minor characters", otherwise at the end.
 */
export function addSection(text: string, name: string, body = ""): string {
  const heads = headingLines(text).filter(h => h.level === 2);
  const tail = heads[heads.length - 1];
  const block = `## ${name.trim()}\n\n${body ? body.trim() + "\n" : ""}`;
  if (tail && /^(minor|other|more|background)\b/i.test(tail.title)) {
    return text.slice(0, tail.offset) + block + "\n" + text.slice(tail.offset);
  }
  return text.replace(/\s*$/, "") + "\n\n" + block;
}

/** "- **Role:** narrator" style fields at the top of a section. */
export function sectionFields(body: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^[-*]\s+\*\*([^*:]{1,40}):\*\*\s*(.*)$/);
    if (m) out.push({ label: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

// ---------- entries written as bullets: "- **Name.** text" ----------

interface BulletRange { start: number; end: number; name: string; marker: string; punct: string; text: string }

function bulletRanges(text: string): BulletRange[] {
  const out: BulletRange[] = [];
  let offset = 0;
  let current: BulletRange | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^([-*])\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      if (current) out.push(current);
      const raw = m[2];
      const punct = /[.:]\s*$/.test(raw) ? raw.match(/[.:]\s*$/)![0].trim() : (m[3].match(/^[.:]/)?.[0] ?? "");
      current = { start: offset, end: offset + line.length, name: raw.replace(/[.:]\s*$/, "").trim(), marker: m[1], punct, text: m[3].replace(/^[.:]\s*/, "") };
    } else if (current && /^\s+\S/.test(line)) {
      current.end = offset + line.length;
      current.text += "\n" + line;
    } else if (current) { out.push(current); current = null; }
    offset += line.length + 1;
  }
  if (current) out.push(current);
  return out;
}

const findBullet = (text: string, slug: string) => bulletRanges(text).find(b => slugify(b.name.replace(/[*_`]/g, "")) === slug) ?? null;
const bulletLine = (b: { marker: string; name: string; punct: string }, body: string) =>
  `${b.marker} **${b.name}${b.punct}**${body ? " " + body.replace(/\s*\n\s*\n\s*/g, " ").replace(/\n(?!\s)/g, " ").trim() : ""}`;

export function bulletBody(text: string, slug: string): string | null {
  const b = findBullet(text, slug);
  return b ? b.text.replace(/\n\s+/g, "\n").trim() : null;
}
export function replaceBulletBody(text: string, slug: string, body: string): string {
  const b = findBullet(text, slug);
  return b ? text.slice(0, b.start) + bulletLine(b, body) + text.slice(b.end) : text;
}
export function renameBullet(text: string, slug: string, name: string): string {
  const b = findBullet(text, slug);
  return b ? text.slice(0, b.start) + bulletLine({ ...b, name: name.trim() }, b.text) + text.slice(b.end) : text;
}
export function removeBullet(text: string, slug: string): string {
  const b = findBullet(text, slug);
  if (!b) return text;
  const after = text[b.end] === "\n" ? b.end + 1 : b.end;
  return text.slice(0, b.start) + text.slice(after);
}
export function addBullet(text: string, name: string): string {
  const all = bulletRanges(text);
  const last = all[all.length - 1];
  const line = bulletLine({ marker: last?.marker ?? "-", name: name.trim(), punct: last?.punct || "." }, "");
  if (!last) return text.replace(/\s*$/, "") + "\n\n" + line + "\n";
  return text.slice(0, last.end) + "\n" + line + text.slice(last.end);
}

/** Read and edit one entry of a bible page, whichever way the page writes its entries. */
export function entryOps(form: "section" | "bullet" = "section") {
  return form === "bullet"
    ? { body: bulletBody, replace: replaceBulletBody, rename: renameBullet, remove: removeBullet, add: addBullet }
    : { body: sectionBody, replace: replaceSectionBody, rename: renameSection, remove: removeSection, add: (text: string, name: string) => addSection(text, name) };
}

/** How a bible page writes its entries: "## Name" sections, or bold-named bullets. */
export function entryFormFor(text: string): "section" | "bullet" {
  if (headingLines(text).some(h => h.level === 2)) return "section";
  return bulletRanges(text).length ? "bullet" : "section";
}
