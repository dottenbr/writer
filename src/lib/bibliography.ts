/**
 * The book's sources: a CSL-YAML bibliography (`references:` list), as Pandoc
 * and bookkit's build read it. Citations in the text are `[@key]`,
 * `[@key, locator]` or `[see @key, 12; @other]`.
 */
import { parseDocument, isMap, isSeq, type Document } from "yaml";
import { CITATION } from "./pandoc-marks";

export const DEFAULT_BIBLIOGRAPHY = "research/bibliography.yaml";

export interface Person { family?: string; given?: string; literal?: string }

export interface Source {
  id: string;
  type: string;
  title?: string;
  author?: Person[];
  editor?: Person[];
  translator?: Person[];
  "container-title"?: string;
  publisher?: string;
  "publisher-place"?: string;
  issued?: { "date-parts"?: Array<Array<number | string>>; literal?: string };
  volume?: string;
  page?: string;
  URL?: string;
  DOI?: string;
  note?: string;
  [key: string]: unknown;
}

export const SOURCE_TYPES: Array<{ value: string; label: string }> = [
  { value: "book", label: "Book" },
  { value: "chapter", label: "Chapter in a book" },
  { value: "article-journal", label: "Journal article" },
  { value: "article-newspaper", label: "Newspaper article" },
  { value: "article-magazine", label: "Magazine article" },
  { value: "webpage", label: "Web page" },
  { value: "thesis", label: "Thesis" },
  { value: "report", label: "Report" },
  { value: "manuscript", label: "Manuscript or archive item" },
  { value: "interview", label: "Interview" },
  { value: "motion_picture", label: "Film" },
  { value: "entry-dictionary", label: "Dictionary entry" },
  { value: "entry-encyclopedia", label: "Encyclopedia entry" },
  { value: "document", label: "Other document" },
];

/** The bibliography file a book uses. */
export function bibliographyPath(config: Record<string, any> | undefined): string {
  const p = config?.citations?.bibliography;
  return typeof p === "string" && p.trim() ? p.trim() : DEFAULT_BIBLIOGRAPHY;
}

export function parseSources(text: string): Source[] {
  if (!text.trim()) return [];
  try {
    const doc = parseDocument(text);
    const data = doc.toJS() as { references?: Source[] } | Source[] | null;
    const list = Array.isArray(data) ? data : data?.references ?? [];
    return list.filter(s => s && typeof s.id === "string");
  } catch {
    return [];
  }
}

export function personName(p: Person): string {
  return p.literal ?? [p.given, p.family].filter(Boolean).join(" ");
}

export function year(s: Source): string {
  const parts = s.issued?.["date-parts"]?.[0];
  return parts?.[0] != null ? String(parts[0]) : s.issued?.literal ?? "";
}

/** "Luther 1912", "Abbott-Smith 1922", "Ælfric". */
export function shortCite(s: Source | undefined, key: string, locator?: string): string {
  if (!s) return `@${key}${locator ? `, ${locator}` : ""}`;
  const people = s.author?.length ? s.author : s.editor ?? [];
  const names = people.map(p => p.family ?? p.literal ?? "").filter(Boolean);
  const who = names.length > 2 ? `${names[0]} et al.` : names.join(" and ");
  const label = who || (s.title ? shorten(s.title, 32) : `@${key}`);
  return [label, year(s)].filter(Boolean).join(" ") + (locator ? `, ${locator}` : "");
}

function shorten(text: string, n: number) {
  return text.length > n ? text.slice(0, n - 1).trimEnd() + "…" : text;
}

/** A full reference in a plain Chicago-like form, for previews. */
export function fullCite(s: Source): string {
  const authors = (s.author ?? []).map(personName).join(", ");
  const eds = (s.editor ?? []).map(personName).join(", ");
  const title = s.title ?? "";
  const inside = s["container-title"] ? `In ${s["container-title"]}${eds ? `, edited by ${eds}` : ""}` : eds && !authors ? `Edited by ${eds}` : "";
  const pub = [s["publisher-place"], s.publisher].filter(Boolean).join(": ");
  return [authors, title, inside, [pub, year(s)].filter(Boolean).join(", "), s.page ? `pp. ${s.page}` : "", s.URL ?? (s.DOI ? `https://doi.org/${s.DOI}` : "")]
    .filter(Boolean).join(". ").replace(/\.\./g, ".") + ".";
}

/** One cited item inside `[ … ]`. */
export interface CiteItem { key: string; locator?: string; prefix?: string }

/** `[see @a, 12; @b]` → items. */
export function parseCitation(raw: string): CiteItem[] {
  const inner = raw.replace(/^\[|\]$/g, "");
  const out: CiteItem[] = [];
  for (const part of inner.split(";")) {
    const m = part.match(/^\s*(.*?)-?@([\w][\w:.#$%&+?<>~/-]*)\s*(?:,\s*(.+?))?\s*$/);
    if (m) out.push({ prefix: m[1]?.trim() || undefined, key: m[2].replace(/[.:,;]+$/, ""), locator: m[3]?.trim() || undefined });
  }
  return out;
}

export function formatCitation(items: CiteItem[]): string {
  return `[${items.map(i => `${i.prefix ? i.prefix + " " : ""}@${i.key}${i.locator ? `, ${i.locator}` : ""}`).join("; ")}]`;
}

/** A citation key from author and year, unique in `taken`. */
export function makeKey(s: Partial<Source>, taken: Set<string>): string {
  const who = (s.author?.[0]?.family ?? s.author?.[0]?.literal ?? s.title ?? "source").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "").slice(0, 18) || "source";
  const base = who + (year(s as Source) || "");
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}${String.fromCharCode(95 + i)}`;
  return key;
}

function referencesSeq(doc: Document) {
  const refs = doc.get("references");
  return isSeq(refs) ? refs : null;
}

/** Add or replace one source, keeping every other line (and comments) as they were. */
export function upsertSource(text: string, source: Source, previousId = source.id): string {
  const doc = parseDocument(text.trim() ? text : "references: []\n");
  let seq = referencesSeq(doc);
  if (!seq) { doc.set("references", doc.createNode([])); seq = referencesSeq(doc)!; }
  seq.flow = false;
  const clean = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));
  const node = doc.createNode(clean);
  const index = seq.items.findIndex(it => isMap(it) && it.get("id") === previousId);
  if (index >= 0) seq.items[index] = node; else seq.items.push(node);
  return doc.toString({ lineWidth: 0 });
}

export function removeSource(text: string, id: string): string {
  const doc = parseDocument(text);
  const seq = referencesSeq(doc);
  if (!seq) return text;
  const index = seq.items.findIndex(it => isMap(it) && it.get("id") === id);
  if (index < 0) return text;
  seq.items.splice(index, 1);
  return doc.toString({ lineWidth: 0 });
}

/** Does this YAML fragment define `id`? */
export function definesSource(text: string, id: string): boolean {
  return parseSources(text).some(s => s.id === id);
}

/** Where each source is cited: path → keys. */
export function citedKeys(markdown: string): string[] {
  const out: string[] = [];
  const prose = markdown.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
  for (const m of prose.matchAll(new RegExp(CITATION.source, "g"))) for (const item of parseCitation(m[0])) out.push(item.key);
  return out;
}

/** book.yaml with `citations.bibliography` set, if it was not. */
export function withBibliography(bookYaml: string, path = DEFAULT_BIBLIOGRAPHY): string {
  const doc = parseDocument(bookYaml || "{}\n");
  if (doc.getIn(["citations", "bibliography"])) return bookYaml;
  doc.setIn(["citations", "bibliography"], path);
  return doc.toString({ lineWidth: 0 });
}

export const NEW_BIBLIOGRAPHY = "# CSL-YAML: the book's sources. Cite them as [@key] or [@key, page].\nreferences: []\n";
