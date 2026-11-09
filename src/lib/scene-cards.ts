/**
 * Scene cards: the "## Scene N – Title" sections of outline/scenes/NN-*.md,
 * each a list of "- **Label:** value" fields with optional sub-bullets.
 * Only the scene being edited is rewritten; the rest of the file is kept
 * byte for byte.
 */
import { slugify } from "./book-model";
import { findSection, renameSection, replaceSectionBody, removeSection } from "./entity-section";

export interface SceneField { label: string; value: string; items: string[] }
export interface SceneCard {
  slug: string;
  heading: string;
  number?: number;
  title: string;
  fields: SceneField[];
  /** Anything in the scene that isn't a field, kept as written. */
  extra: string;
}

export const SCENE_FIELDS = ["Where and when", "Who", "Purpose", "What happens", "Turn", "Reader knows by the end", "Sets up / pays off", "Lines that matter", "Ends on"];

const HEADING = /^Scene\s+(\d+)\s*([–—:-])\s*(.*)$/i;

function headings(text: string): Array<{ offset: number; title: string }> {
  const out: Array<{ offset: number; title: string }> = [];
  let offset = 0, fence = false, front = text.startsWith("---\n");
  text.split("\n").forEach((line, i) => {
    if (front && i > 0 && /^---\s*$/.test(line)) front = false;
    else if (!front) {
      if (/^(```|~~~)/.test(line)) fence = !fence;
      if (!fence && /^## /.test(line)) out.push({ offset, title: line.slice(3).trim() });
    }
    offset += line.length + 1;
  });
  return out;
}

export function parseSceneBody(body: string): { fields: SceneField[]; extra: string } {
  const fields: SceneField[] = [];
  const extra: string[] = [];
  let current: SceneField | null = null;
  for (const line of body.split("\n")) {
    const field = line.match(/^[-*]\s+\*\*([^*]{1,60}?):\*\*\s*(.*)$/);
    const item = line.match(/^\s+[-*](?:\s+(.*))?$/);
    if (field) { current = { label: field[1].trim(), value: field[2], items: [] }; fields.push(current); }
    else if (item && current) current.items.push(item[1] ?? "");
    else if (current && /^\s+\S/.test(line)) {
      if (current.items.length) current.items[current.items.length - 1] += " " + line.trim();
      else current.value += " " + line.trim();
    } else if (line.trim()) { current = null; extra.push(line); }
    else if (extra.length) extra.push(line);
  }
  return { fields, extra: extra.join("\n").trim() };
}

export function serializeSceneBody(fields: SceneField[], extra: string): string {
  const lines = fields.map(f => `- **${f.label}:**${f.value ? " " + f.value.replace(/\s*\n\s*/g, " ") : ""}` + f.items.map(i => `\n  - ${i.replace(/\s*\n\s*/g, " ")}`).join(""));
  return lines.join("\n") + (extra.trim() ? (lines.length ? "\n\n" : "") + extra.trim() : "");
}

export function parseScenes(text: string): SceneCard[] {
  return headings(text).map(h => {
    const slug = slugify(h.title.replace(/[*_`]/g, ""));
    const r = findSection(text, slug)!;
    const m = h.title.match(HEADING);
    const { fields, extra } = parseSceneBody(text.slice(r.bodyStart, r.end));
    return { slug, heading: h.title, number: m ? Number(m[1]) : undefined, title: m ? m[3] : h.title, fields, extra };
  });
}

function headingFor(card: SceneCard, title: string): string {
  const m = card.heading.match(HEADING);
  return m ? `Scene ${m[1]} ${m[2]} ${title}`.replace(/\s+$/, "") : title;
}

/** Write one scene back. Returns the new file text and the scene's (possibly new) slug. */
export function updateScene(text: string, card: SceneCard, next: { title?: string; fields?: SceneField[]; extra?: string }): { text: string; slug: string } {
  let out = text;
  let slug = card.slug;
  if (next.fields || next.extra != null) out = replaceSectionBody(out, slug, serializeSceneBody(next.fields ?? card.fields, next.extra ?? card.extra));
  if (next.title != null && next.title !== card.title) {
    const heading = headingFor(card, next.title);
    out = renameSection(out, slug, heading);
    slug = slugify(heading);
  }
  return { text: out, slug };
}

/** Renumber "Scene N" headings in file order. */
export function renumberScenes(text: string): string {
  let n = 0;
  return text.replace(/^## Scene\s+\d+(\s*[–—:-])/gm, (_m, sep) => `## Scene ${++n}${sep}`);
}

export function addScene(text: string, title: string): { text: string; slug: string } {
  const cards = parseScenes(text);
  const n = cards.length + 1;
  const sep = cards[0]?.heading.match(HEADING)?.[2] ?? "–";
  const heading = `Scene ${n} ${sep} ${title.trim() || "New scene"}`;
  const body = serializeSceneBody(["Where and when", "Who", "Purpose", "What happens", "Turn", "Ends on"].map(label => ({ label, value: "", items: [] })), "");
  return { text: text.replace(/\s*$/, "") + `\n\n## ${heading}\n\n${body}\n`, slug: slugify(heading) };
}

export function deleteScene(text: string, slug: string): string {
  return renumberScenes(removeSection(text, slug)).replace(/\s*$/, "\n");
}

/** Move a scene up or down one place and renumber. */
export function moveScene(text: string, slug: string, by: -1 | 1): string {
  const cards = parseScenes(text);
  const i = cards.findIndex(c => c.slug === slug);
  const j = i + by;
  if (i < 0 || j < 0 || j >= cards.length) return text;
  const a = findSection(text, cards[Math.min(i, j)].slug)!;
  const b = findSection(text, cards[Math.max(i, j)].slug)!;
  const blockA = text.slice(a.start, a.end).replace(/\s*$/, "");
  const blockB = text.slice(b.start, b.end).replace(/\s*$/, "");
  const between = text.slice(a.start + text.slice(a.start, a.end).replace(/\s*$/, "").length, b.start);
  const tail = text.slice(b.start + text.slice(b.start, b.end).replace(/\s*$/, "").length);
  return renumberScenes(text.slice(0, a.start) + blockB + between + blockA + tail);
}

/** A new scene-card file for a chapter that has none yet. */
export function newScenesFile(chapter: number, title: string): string {
  return `---\nchapter: ${chapter}\n---\n\n# ${chapter}. ${title}\n`;
}
