/**
 * Chapter anchors as the bookkit standard writes them, and as the app shows them.
 *
 *   *Ch. 9*   *Chs. 5–6*   *Ch. 3, Scene 4*   *Ch. 1, Scene 5; Ch. 6*   *off the page*
 *   *Ch. 9*: “forcing them underground”      (quoted words pin the fact to the text)
 *
 * In companion files every anchor sits at the end of its fact, in one parenthetical:
 *   - Thirty-eight at the January 1935 vote. (*Ch. 5, Scene 9*: “I was thirty-eight”; *Ch. 6*)
 * The app shows the fact and, beside it, the anchors as chips.
 */
import type { ChapterInfo } from "./book-model";

const LIST = String.raw`\d+(?:\s*(?:[–-]|,|and|&)\s*\d+)*`;
const REF = String.raw`Chs?\.\s+${LIST}(?:,\s*Scenes?\s+${LIST})?`;
const ANCHOR = String.raw`\*(?:${REF}(?:\s*(?:;|,|and)\s*${REF})*)\.?\*`;
const QUOTE = String.raw`(?:\s*:\s*(?:“[^”\n]+”|"[^"\n]+"))`;
const ONE = String.raw`(?:${ANCHOR}${QUOTE}?|\*off the page\*)`;

/** One anchor with its quote, anywhere in a text. */
export const ANCHOR_RE = () => new RegExp(ONE, "g");
const REF_RE = () => new RegExp(REF, "g");
/** A run of anchors in one parenthetical at the end of a line. */
const TRAILING_RE = new RegExp(String.raw`\s*\(\s*(${ONE}(?:\s*;\s*${ONE})*)\s*\)[.;,]?\s*$`);

export interface AnchorRef {
  /** Chapter numbers, expanded from lists and ranges. */
  chapters: number[];
  scenes: number[];
}

export interface Anchor {
  /** The exact source text, quote included. */
  raw: string;
  refs: AnchorRef[];
  quote?: string;
  offPage?: boolean;
}

function numbers(spec: string): number[] {
  const out: number[] = [];
  for (const m of spec.matchAll(/(\d+)(?:\s*[–-]\s*(\d+))?/g)) {
    const first = Number(m[1]);
    const last = m[2] ? Number(m[2]) : first;
    if (last >= first && last - first < 200) for (let n = first; n <= last; n++) out.push(n);
    else out.push(first);
  }
  return out;
}

function parseRef(text: string): AnchorRef {
  let body = text.replace(/^Chs?\.\s*/, "");
  const scene = body.match(/,?\s*Scenes?\s+([\d\s,–\-and&]+)/);
  let scenes: number[] = [];
  if (scene) {
    scenes = numbers(scene[1]);
    body = body.slice(0, scene.index);
  }
  return { chapters: numbers(body), scenes };
}

/** Parse one anchor's source text (`*Ch. 3, Scene 4*: “words”`). */
export function parseAnchor(raw: string): Anchor {
  if (/^\*off the page\*$/.test(raw.trim())) return { raw, refs: [], offPage: true };
  const quote = raw.match(/:\s*(?:“([^”\n]+)”|"([^"\n]+)")\s*$/);
  const head = quote ? raw.slice(0, quote.index) : raw;
  const refs = [...head.matchAll(REF_RE())].map(m => parseRef(m[0]));
  return { raw, refs, quote: quote ? (quote[1] ?? quote[2]) : undefined };
}

/** Every anchor in a text, with where it is. */
export function findAnchors(text: string): Array<Anchor & { from: number; to: number }> {
  return [...text.matchAll(ANCHOR_RE())].map(m => ({ ...parseAnchor(m[0]), from: m.index!, to: m.index! + m[0].length }));
}

/** Split a line into its fact and the anchors parenthesized at its end. */
export function splitFact(line: string): { text: string; anchors: Anchor[]; tailFrom: number } {
  const m = line.match(TRAILING_RE);
  if (!m) return { text: line, anchors: [], tailFrom: line.length };
  const anchors = findAnchors(m[1]).map(({ from: _f, to: _t, ...a }) => a);
  return { text: line.slice(0, m.index), anchors, tailFrom: m.index! };
}

/** The anchor run written back: `(*Ch. 1*; *Ch. 2, Scene 3*: “words”)`. */
export function formatTrailing(anchors: Anchor[]): string {
  return anchors.length ? ` (${anchors.map(a => a.raw).join("; ")})` : "";
}

/** Write an anchor from its parts. */
export function formatAnchor(a: { chapters: number[]; scenes?: number[]; quote?: string; offPage?: boolean }): string {
  if (a.offPage) return "*off the page*";
  const chapters = compact(a.chapters);
  const many = a.chapters.length > 1;
  const scenes = a.scenes?.length ? `, Scene${a.scenes.length > 1 ? "s" : ""} ${compact(a.scenes)}` : "";
  const quote = a.quote?.trim() ? `: “${a.quote.trim().replace(/[“”]/g, "")}”` : "";
  return `*Ch${many ? "s" : ""}. ${chapters}${scenes}*${quote}`;
}

/** 1,2,3,5 → "1–3, 5" */
function compact(list: number[]): string {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(", ");
}

/** A short label for a chip: "Ch. 5 · Sc. 9", "Chs. 5–6", "Off the page". */
export function anchorLabel(a: Anchor): string {
  if (a.offPage) return "Off the page";
  return a.refs.map(r => {
    const ch = `Ch${r.chapters.length > 1 ? "s" : ""}. ${compact(r.chapters)}`;
    return r.scenes.length ? `${ch} · Sc. ${compact(r.scenes)}` : ch;
  }).join("; ");
}

/** Fold quotes, dashes, emphasis and space, as bookkit's check does. */
export function foldText(text: string): string {
  return text.normalize("NFKC").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, "-").replace(/[*_]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export type AnchorStatus = "ok" | "no-chapter" | "no-scene" | "no-quote" | "off-page";

export interface ResolvedAnchor {
  status: AnchorStatus;
  /** The first chapter it names. */
  chapter?: ChapterInfo;
  scene?: number;
  sceneTitle?: string;
  problem?: string;
}

const foldedCache = new Map<string, { content: string; folded: string }>();
function folded(path: string, content: string): string {
  const hit = foldedCache.get(path);
  if (hit && hit.content === content) return hit.folded;
  const f = foldText(content);
  foldedCache.set(path, { content, folded: f });
  return f;
}

/** Check an anchor against the book: do the chapter and scene exist, are the quoted words in the chapter? */
export function resolveAnchor(a: Anchor, chapters: ChapterInfo[], contentOf: (path: string) => string | undefined): ResolvedAnchor {
  if (a.offPage) return { status: "off-page" };
  const first = a.refs[0];
  const chapter = first ? chapters.find(c => c.number === first.chapters[0]) : undefined;
  for (const r of a.refs) {
    for (const n of r.chapters) {
      const c = chapters.find(x => x.number === n);
      if (!c) return { status: "no-chapter", chapter, problem: `There is no chapter ${n}.` };
      const lost = r.scenes.filter(s => c.sceneTitles.length > 0 && s > c.sceneTitles.length);
      if (lost.length) return { status: "no-scene", chapter: c, problem: `Chapter ${n} has ${c.sceneTitles.length} scenes; there is no scene ${lost.join(", ")}.` };
    }
  }
  const scene = first?.scenes[0];
  const sceneTitle = chapter && scene ? chapter.sceneTitles[scene - 1]?.replace(/^Scene\s+\d+\s*[–—-]\s*/i, "") : undefined;
  if (a.quote) {
    const named = a.refs.flatMap(r => r.chapters).map(n => chapters.find(c => c.number === n)).filter((c): c is ChapterInfo => !!c);
    const needle = foldText(a.quote);
    const found = named.some(c => {
      const content = contentOf(c.currentPath);
      return content !== undefined && folded(c.currentPath, content).includes(needle);
    });
    const known = named.some(c => contentOf(c.currentPath) !== undefined);
    if (known && !found) return { status: "no-quote", chapter, scene, sceneTitle, problem: "These words are not in the chapter any more." };
  }
  return { status: "ok", chapter, scene, sceneTitle };
}
