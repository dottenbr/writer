/**
 * A structured, file-free view of a Bookkit book: chapters, story bible
 * entries, plan and craft documents, and the links between them.
 * Files stay the storage format; nothing in the UI needs to show a path.
 */
import { parse as parseYaml } from "yaml";
import { BOOK_FORMS, formMeta, type BookForm, type BookKind } from "./book-config";
import { splitDocument, markdownToPlain, countWords } from "./markdown-doc";

export interface SourceFile { path: string; content: string; loaded?: boolean; asset?: unknown; version?: number }

export type Group = "story" | "bible" | "plan" | "craft" | "research" | "matter" | "publication" | "source";

export interface Heading { level: number; text: string; slug: string }

export interface CompanionDoc {
  path: string;
  title: string;
  group: Group;
  headings: Heading[];
  isAsset: boolean;
  loaded: boolean;
}

export interface ChapterInfo {
  number: number;
  title: string;
  subtitle?: string;
  label: string;
  status: string;
  part?: { key: string; title: string };
  authorPath?: string;
  referencePath?: string;
  /** The text of record: the author's chapter when written, otherwise the reference draft. */
  currentPath: string;
  currentSource: "author" | "reference";
  started: boolean;
  scenesPath?: string;
  outline?: string;
  purpose?: string;
  authorWords: number;
  referenceWords: number;
  /** Explicit per-chapter word goal from front matter (`draft_budget_words` or `target_words`), if set. */
  budgetWords?: number;
  /** Resolved word-count goal for this chapter. */
  targetWords: number;
  sceneTitles: string[];
}

export type EntityKind = "character" | "place" | "organization" | "motif" | "entry";

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  path: string;
  slug: string;
  aliases: string[];
  summary: string;
  markdown: string;
  group: boolean;
  /** "section": a "## Name" section (default). "bullet": a "- **Name.** text" line. */
  form?: "section" | "bullet";
}

export interface BookModel {
  title: string;
  author: string;
  kind: BookKind;
  form: BookForm;
  formLabel: string;
  formEyebrow: string;
  targetWords: number;
  chapterTargetWords: number;
  config: Record<string, any>;
  manuscriptDir: string;
  draftDir?: string;
  chapters: ChapterInfo[];
  companions: CompanionDoc[];
  entities: Entity[];
  hasDraft: boolean;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[“”"'’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

/** Where a chapter's scene cards live (the file may not exist yet). */
export const scenesPathFor = (c: { number: number; title: string; scenesPath?: string }) =>
  c.scenesPath ?? `outline/scenes/${String(c.number).padStart(2, "0")}-${slugify(c.title || "chapter")}.md`;

const pretty = (name: string) =>
  name.replace(/\.(md|ya?ml|txt)$/i, "").replace(/^\d+[-_]/, "").replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());

const KNOWN_TITLES: Record<string, string> = {
  "bible/book-on-one-page.md": "The book on one page",
  "bible/canon.md": "Canon",
  "bible/characters.md": "Characters",
  "bible/timeline.md": "Timeline",
  "bible/places.md": "Places",
  "bible/motifs.md": "Motifs",
  "outline/chapters.md": "Chapter outline",
  "outline/arcs.md": "Arcs",
  "outline/open-questions.md": "Open questions",
  "craft/style-guide.md": "Style guide",
  "craft/author-voice.md": "Author voice",
  "research/README.md": "Research overview",
  "research/claims.md": "Claim ledger",
  "README.md": "About this book",
};

export function headingsOf(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    if (fence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, ""), slug: slugify(m[2].replace(/[*_`]/g, "")) });
  }
  return out;
}

function groupOf(path: string, config: Record<string, any>): Group | null {
  const dir = config?.manuscript?.dir ?? "manuscript";
  const draft = config?.manuscript?.draft;
  if (path.startsWith(dir + "/") || (draft && path.startsWith(draft + "/"))) return null;
  if (path === "bible/book-on-one-page.md") return "story";
  if (path.startsWith("bible/")) return "bible";
  if (path.startsWith("outline/scenes/")) return null;
  if (path.startsWith("outline/")) return "plan";
  if (path.startsWith("craft/")) return "craft";
  if (path.startsWith("research/")) return "research";
  if (path.startsWith("frontmatter/") || path.startsWith("backmatter/")) return "matter";
  if (path.startsWith("publication/")) return "publication";
  return "source";
}

/** Sections of a markdown body split at a given heading level. */
export function sections(body: string, level = 2): Array<{ heading: string; text: string }> {
  const marker = "#".repeat(level) + " ";
  const out: Array<{ heading: string; text: string }> = [];
  let current: { heading: string; text: string } | null = null;
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const isHeading = !fence && line.startsWith(marker);
    const isHigher = !fence && level > 1 && /^#{1,}\s/.test(line) && line.match(/^#+/)![0].length < level;
    if (isHeading) {
      if (current) out.push(current);
      current = { heading: line.slice(marker.length).trim(), text: "" };
    } else if (isHigher) {
      if (current) out.push(current);
      current = null;
    } else if (current) current.text += line + "\n";
  }
  if (current) out.push(current);
  return out;
}

const KIND_BY_FILE: Array<[RegExp, EntityKind]> = [
  [/characters|people|cast/, "character"],
  [/places|locations|settings|geography/, "place"],
  [/organi[sz]ations|institutions|companies/, "organization"],
  [/motifs|symbols|objects/, "motif"],
];

/** The kind of entry a bible page holds as "## Name" sections, if it is a page of cards (characters, places…). */
export function entityKindForPath(path: string): EntityKind | undefined {
  if (!path.startsWith("bible/") || !path.endsWith(".md")) return undefined;
  const base = path.slice(6).replace(/\.md$/, "");
  return KIND_BY_FILE.find(([re]) => re.test(base))?.[1];
}

const STOP = new Set(["The", "A", "An", "Doctor", "Dr", "Mr", "Mrs", "Ms", "Herr", "Frau", "Father", "Mother", "Saint", "St", "Old", "Young", "Minor", "Other", "And"]);

function aliasesFor(name: string, kind: EntityKind): string[] {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+—.*$/, "").replace(/[:,].*$/, "").trim();
  const nick = [...clean.matchAll(/[“"']([^”"']+)[”"']/g)].map(m => m[1].trim());
  const plain = clean.replace(/[“"'][^”"']+[”"']/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  if (plain.length > 2) out.add(plain);
  nick.forEach(n => n.length > 2 && out.add(n));
  if (kind === "character" || kind === "organization") {
    const words = plain.split(" ").filter(w => /^\p{Lu}/u.test(w) && !STOP.has(w.replace(/\.$/, "")));
    if (words.length > 1) { out.add(words[0]); out.add(words[words.length - 1]); }
    if (nick.length && words.length) out.add(nick[0] + " " + words[words.length - 1]);
  }
  return [...out].filter(a => a.length > 2 && /\p{Lu}/u.test(a));
}

function firstParagraph(markdown: string): string {
  const para = markdown.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#"));
  return para ? markdownToPlain(para).replace(/\s+/g, " ").trim().slice(0, 320) : "";
}

/** Top-level "- **Name.** text" bullets (with any indented continuation lines). */
export function bulletEntries(body: string): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  let current: { name: string; text: string } | null = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      if (current) out.push(current);
      current = { name: m[1].replace(/[.:]\s*$/, "").trim(), text: m[2].replace(/^[.:]\s*/, "") };
    } else if (current && /^\s+\S/.test(line)) current.text += "\n" + line;
    else if (current) { out.push(current); current = null; }
  }
  if (current) out.push(current);
  return out.filter(b => b.name);
}

export function extractEntities(files: SourceFile[]): Entity[] {
  const entities: Entity[] = [];
  for (const file of files) {
    if (!file.path.startsWith("bible/") || !file.path.endsWith(".md") || !file.loaded) continue;
    const base = file.path.slice(6).replace(/\.md$/, "");
    const kind = KIND_BY_FILE.find(([re]) => re.test(base))?.[1];
    if (!kind) continue;
    const { body } = splitDocument(file.content);
    const parts = sections(body, 2);
    // Pages written as a list of bold-named bullets ("- **Counting.** …") are entries too.
    if (!parts.length) {
      for (const b of bulletEntries(body)) {
        entities.push({ id: file.path + "#" + slugify(b.name), name: b.name, kind, path: file.path, slug: slugify(b.name), aliases: [], summary: markdownToPlain(b.text).replace(/\s+/g, " ").trim().slice(0, 320), markdown: b.text, group: false, form: "bullet" });
      }
      continue;
    }
    for (const s of parts) {
      const name = s.heading.replace(/[*_`]/g, "");
      const words = name.split(/\s+/);
      const group = /^(minor|other|real|more|also|groups?|background|named)\b/i.test(name) || (words.length > 2 && words.slice(1).every(w => !/^\p{Lu}/u.test(w)) && !/^\p{Lu}/u.test(words[1] ?? ""));
      entities.push({
        id: file.path + "#" + slugify(name),
        name,
        kind,
        path: file.path,
        slug: slugify(name),
        aliases: group ? [] : aliasesFor(name, kind),
        summary: firstParagraph(s.text),
        markdown: s.text.trim(),
        group,
      });
    }
  }
  // An alias shared by two entries (a family name, say) links to neither.
  const count = new Map<string, number>();
  for (const e of entities) for (const a of e.aliases) count.set(a, (count.get(a) ?? 0) + 1);
  for (const e of entities) e.aliases = e.aliases.filter(a => count.get(a) === 1);
  return entities;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Build one matcher for all entity aliases, longest first. */
export function entityMatcher(entities: Entity[]): { regex: RegExp | null; byAlias: Map<string, Entity> } {
  const byAlias = new Map<string, Entity>();
  for (const e of entities) for (const a of e.aliases) byAlias.set(a, e);
  const aliases = [...byAlias.keys()].sort((a, b) => b.length - a.length);
  if (!aliases.length) return { regex: null, byAlias };
  return { regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${aliases.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "gu"), byAlias };
}

export function mentionsIn(text: string, matcher: ReturnType<typeof entityMatcher>): Map<string, number> {
  const out = new Map<string, number>();
  if (!matcher.regex) return out;
  for (const m of text.matchAll(matcher.regex)) {
    const e = matcher.byAlias.get(m[0]);
    if (e) out.set(e.id, (out.get(e.id) ?? 0) + 1);
  }
  return out;
}

/** Chapter anchors such as *Ch. 9*, *Chs. 5–6*, *Chs. 1–2, 5, 7*. */
export const CHAPTER_ANCHOR = /\bCh(?:apter)?s?\.?\s+(\d+(?:\s*[–—-]\s*\d+)?(?:\s*(?:,|and|&)\s*\d+(?:\s*[–—-]\s*\d+)?)*)/g;

export function anchorNumbers(list: string): number[] {
  const out: number[] = [];
  for (const part of list.split(/\s*(?:,|and|&)\s*/)) {
    const range = part.match(/(\d+)\s*[–—-]\s*(\d+)/);
    if (range) { for (let i = +range[1]; i <= +range[2] && i - +range[1] < 200; i++) out.push(i); }
    else if (/^\d+$/.test(part.trim())) out.push(+part.trim());
  }
  return out;
}

export function citedChapters(markdown: string): number[] {
  const out = new Set<number>();
  for (const m of markdown.matchAll(CHAPTER_ANCHOR)) anchorNumbers(m[1]).forEach(n => out.add(n));
  return [...out];
}

function chapterFiles(files: SourceFile[], dir: string | undefined) {
  const out = new Map<number, { file: SourceFile; meta: Record<string, any> }>();
  if (!dir) return out;
  for (const f of files) {
    if (!f.path.startsWith(dir + "/") || !f.path.endsWith(".md") || f.path.endsWith("README.md")) continue;
    const { metadata } = splitDocument(f.content);
    const n = Number(metadata.chapter ?? f.path.split("/").pop()!.slice(0, 2));
    if (Number.isInteger(n) && n > 0 && !out.has(n)) out.set(n, { file: f, meta: metadata as Record<string, any> });
  }
  return out;
}

export function buildBookModel(files: SourceFile[]): BookModel {
  const byPath = new Map(files.map(f => [f.path, f]));
  let config: Record<string, any> = {};
  try { config = parseYaml(byPath.get("book.yaml")?.content ?? "") ?? {}; } catch { config = {}; }
  const manuscriptDir = config?.manuscript?.dir ?? "manuscript";
  const draftDir = config?.manuscript?.draft;
  const authors = chapterFiles(files, manuscriptDir);
  const refs = chapterFiles(files, draftDir);

  const outlineBody = splitDocument(byPath.get("outline/chapters.md")?.content ?? "").body;
  const outlineSections = sections(outlineBody, 2);
  const outlineFor = (n: number) => outlineSections.find(s => new RegExp(`^${n}(?:[.:)\\s]|$)`).test(s.heading));

  const sceneFiles = files.filter(f => f.path.startsWith("outline/scenes/") && f.path.endsWith(".md"));
  const numbers = [...new Set([...authors.keys(), ...refs.keys()])].sort((a, b) => a - b);

  const posInt = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const explicitTargetWords = posInt(config?.manuscript?.target_words);
  const explicitChapterWords = posInt(config?.manuscript?.chapter_words);

  const rawChapters = numbers.map(n => {
    const a = authors.get(n);
    const r = refs.get(n);
    const started = !!a && a.meta.status === "drafting";
    const currentSource: "author" | "reference" = a && (!started || !r) ? "author" : "reference";
    const meta = (currentSource === "author" ? a : r)!.meta;
    const title = String(meta.title ?? a?.meta.title ?? r?.meta.title ?? "");
    const fileName = (a ?? r)!.file.path.split("/").pop()!;
    const scenes = sceneFiles.find(f => splitDocument(f.content).metadata.chapter === n) ?? sceneFiles.find(f => f.path.endsWith("/" + fileName));
    const outline = outlineFor(n);
    const partKey = meta.part != null ? String(meta.part) : (config?.manuscript?.layout === "parts" ? (a ?? r)!.file.path.split("/").slice(-2, -1)[0] : undefined);
    const partTitle = meta.part_title ? String(meta.part_title) : partKey ? pretty(partKey) : "";
    // headings ("## Scene 2 – The offering") aren't words written
    const words = (f?: SourceFile) => (f ? countWords(markdownToPlain(splitDocument(f.content).body.replace(/^#{1,6}\s.*$/gm, ""))) : 0);
    const authorWords = words(a?.file);
    const referenceWords = words(r?.file);
    const budgetWords = posInt(a?.meta?.draft_budget_words ?? a?.meta?.target_words ?? r?.meta?.draft_budget_words ?? r?.meta?.target_words);
    return {
      number: n,
      title,
      subtitle: meta.subtitle ? String(meta.subtitle) : undefined,
      label: title ? `${n}. ${title}` : `Chapter ${n}`,
      status: String((a ?? r)!.meta.status ?? ""),
      part: partKey ? { key: partKey, title: partTitle } : undefined,
      authorPath: a?.file.path,
      referencePath: r?.file.path,
      currentPath: (currentSource === "author" ? a : r)!.file.path,
      currentSource,
      started,
      scenesPath: scenes?.path,
      outline: outline?.text.trim(),
      purpose: outline?.text.match(/\*\*Purpose:\*\*\s*(.+)/)?.[1]?.trim(),
      authorWords,
      referenceWords,
      budgetWords,
      sceneTitles: scenes ? sections(splitDocument(scenes.content).body, 2).map(s => s.heading) : [],
    };
  });

  const totalRefWords = rawChapters.reduce((s, c) => s + c.referenceWords, 0);
  const rawFormStr = String(config?.form ?? (BOOK_FORMS.some(f => f.value === config?.kind) ? config.kind : "")).trim();
  const kind: BookKind =
    rawFormStr && BOOK_FORMS.some(f => f.value === rawFormStr)
      ? formMeta(rawFormStr).kind
      : (config?.kind ?? config?.companion?.kind) === "nonfiction"
        ? "nonfiction"
        : "fiction";

  let inferredForm = rawFormStr;
  if (!inferredForm || !BOOK_FORMS.some(f => f.value === inferredForm)) {
    const onePageText = (byPath.get("bible/book-on-one-page.md")?.content ?? "") + "\n" + (byPath.get("README.md")?.content ?? "");
    if (kind === "nonfiction") {
      inferredForm = /\b(devotional|readings|prayer)\b/i.test(onePageText) ? "devotional" : /\bmemoir\b/i.test(onePageText) ? "memoir" : "nonfiction";
    } else if (/\bnovella\b/i.test(onePageText)) {
      inferredForm = "novella";
    } else if (/\bnovelette\b/i.test(onePageText)) {
      inferredForm = "novelette";
    } else if (/\bshort story\b/i.test(onePageText)) {
      inferredForm = "short-story";
    } else if (/\bshort novel\b/i.test(onePageText)) {
      inferredForm = "short-novel";
    } else if (totalRefWords > 0) {
      inferredForm =
        totalRefWords < 10000
          ? "short-story"
          : totalRefWords < 17500
            ? "novella"
            : totalRefWords <= 40000
              ? "novella"
              : totalRefWords < 55000
                ? "short-novel"
                : "novel";
    } else {
      inferredForm = "novel";
    }
  }
  const fMeta = formMeta(inferredForm, kind);
  const expectedChapterCount = Math.max(rawChapters.length, posInt(config?.manuscript?.chapters) ?? 0, 1);
  const fallbackChapterWords =
    explicitChapterWords ??
    (explicitTargetWords ? Math.max(250, Math.round(explicitTargetWords / expectedChapterCount / 50) * 50) : fMeta.defaultChapterWords);

  const chapters: ChapterInfo[] = rawChapters.map(c => {
    const targetWords =
      c.budgetWords ??
      explicitChapterWords ??
      (c.referenceWords > 0
        ? Math.max(100, Math.round(c.referenceWords / 50) * 50)
        : fallbackChapterWords);
    return { ...c, targetWords };
  });

  const hasAnyBudget = rawChapters.some(c => c.budgetWords != null);
  const targetWords =
    explicitTargetWords ??
    (hasAnyBudget
      ? chapters.reduce((s, c) => s + c.targetWords, 0)
      : explicitChapterWords
        ? explicitChapterWords * expectedChapterCount
        : totalRefWords > 0
          ? Math.max(500, Math.round(totalRefWords / 500) * 500)
          : fMeta.defaultTargetWords);

  const chapterTargetWords =
    explicitChapterWords ??
    (rawChapters.length > 0 && (hasAnyBudget || totalRefWords > 0 || explicitTargetWords != null)
      ? Math.max(100, Math.round(targetWords / rawChapters.length / 50) * 50)
      : fMeta.defaultChapterWords);

  const companions: CompanionDoc[] = [];
  for (const f of files) {
    const group = groupOf(f.path, config);
    if (!group) continue;
    const isMd = /\.md$/i.test(f.path);
    const split = isMd && f.loaded ? splitDocument(f.content) : null;
    companions.push({
      path: f.path,
      title: KNOWN_TITLES[f.path] ?? split?.title ?? pretty(f.path.split("/").pop()!),
      group,
      headings: split ? headingsOf(split.body) : [],
      isAsset: !!f.asset,
      loaded: f.loaded !== false,
    });
  }
  const order = (p: string) => ["bible/book-on-one-page.md", "bible/characters.md", "bible/places.md", "bible/organizations.md", "bible/canon.md", "bible/timeline.md", "bible/motifs.md", "outline/chapters.md", "outline/arcs.md", "outline/open-questions.md", "craft/style-guide.md", "craft/author-voice.md", "research/README.md", "research/claims.md"].indexOf(p);
  companions.sort((x, y) => {
    const ox = order(x.path), oy = order(y.path);
    if (ox >= 0 || oy >= 0) return (ox < 0 ? 999 : ox) - (oy < 0 ? 999 : oy);
    return x.path.localeCompare(y.path);
  });

  return {
    title: String(config.title ?? "Untitled book"),
    author: String(config.author ?? ""),
    kind,
    form: fMeta.value,
    formLabel: fMeta.label,
    formEyebrow: fMeta.eyebrow,
    targetWords,
    chapterTargetWords,
    config,
    manuscriptDir,
    draftDir,
    chapters,
    companions,
    entities: extractEntities(files),
    hasDraft: !!draftDir,
  };
}

/**
 * Front matter for a new author chapter beside a reference draft (bookkit
 * `start`). With the chapter's scene cards, the empty chapter is laid out in
 * scenes to match: a "## Scene N – Title" heading each in books that title
 * scenes (`manuscript.scenes: true`), otherwise a scene break between scenes.
 * Structure only; no words.
 */
export function startChapterContent(referenceRaw: string, config: Record<string, any>, sceneHeadings: string[] = []): string {
  const match = referenceRaw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const required: string[] = config?.manuscript?.front_matter?.required ?? ["chapter", "title", "status"];
  const optional: string[] = config?.manuscript?.front_matter?.optional ?? [];
  const allowed = new Set([...required, ...optional]);
  const entries: Array<[string | null, string[]]> = [];
  for (const line of (match?.[1] ?? "").split("\n")) {
    const key = line.match(/^([A-Za-z_][\w-]*)\s*:/);
    if (key) entries.push([key[1], [line]]);
    else if (entries.length) entries[entries.length - 1][1].push(line);
  }
  const lines: string[] = [];
  let hasStatus = false;
  for (const [key, block] of entries) {
    if (key === "status") { lines.push("status: drafting"); hasStatus = true; }
    else if (!key || !allowed.has(key)) continue;
    else if (key === "draft_budget_words" && !required.includes(key)) continue;
    else lines.push(...block);
  }
  if (!hasStatus) lines.push("status: drafting");
  const body = referenceRaw.slice(match ? match[0].length : 0);
  const h1 = body.split("\n").find(l => l.startsWith("# ")) ?? "";
  const scaffold = sceneHeadings.length < 2 ? "" : config?.manuscript?.scenes
    ? sceneHeadings.map(h => `## ${h}\n\n`).join("")
    : Array(sceneHeadings.length - 1).fill("***\n\n").join("");
  return `---\n${lines.join("\n").replace(/\n+$/, "")}\n---\n\n${h1 ? h1 + "\n\n" : ""}${scaffold}`;
}

export function nextChapterPath(model: BookModel, title: string): { path: string; number: number } {
  const number = (model.chapters[model.chapters.length - 1]?.number ?? 0) + 1;
  const slug = slugify(title).slice(0, 48) || "chapter";
  return { path: `${model.manuscriptDir}/${String(number).padStart(2, "0")}-${slug}.md`, number };
}
