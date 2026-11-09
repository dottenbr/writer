/**
 * Turning speech into the author's text, faithfully, and text into reading
 * chunks. The correction rules follow moth's (newmatik/products/moth,
 * server/utils/voice-text.ts): a context-biased transcript may only swap a
 * single word for a known name, never add, drop, renumber or negate anything.
 */
import type { HouseStyle } from "./book-config";

const COMMON = new Set("the a an and of in on at to for with from by into over under is was were be he she it they we you i his her its their our my your this that these those but or nor so yet not no then there here when where what who why how mr mrs ms dr st old young little great minor other chapter scene".split(" "));

/** Names worth biasing the recogniser towards: bible entries and capitalised words of the chapter. */
export function voiceVocabulary(names: string[], texts: string[] = []): string[] {
  const fromText = texts.map(t => t.slice(0, 4000)).join(" ").match(/\b\p{Lu}[\p{L}’'-]{2,39}\b/gu) ?? [];
  const words = [...names.flatMap(n => n.split(/[\s/]+/)), ...fromText].map(w => w.replace(/^[“"'‘(]+|[”"'’),.;:!?]+$/g, "")).filter(w => /^\p{L}[\p{L}’'-]{1,39}$/u.test(w) && !COMMON.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, 120);
}

const numberWord = /^(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thir|fif|eigh|teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|and))+$/iu;
const negationWord = /^(?:not|no|never|without|neither|nor|none|nothing|nobody|cannot|cant|dont|doesnt|didnt|isnt|arent|wasnt|werent|wont|wouldnt|shouldnt|couldnt|hasnt|havent|hadnt)$/iu;
const protectedTerm = (w: string) => { const n = w.replace(/[-'’]/g, ""); return /\d/.test(w) || numberWord.test(n) || negationWord.test(n); };

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, prev[j + 1] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
    prev = next;
  }
  return prev[b.length];
}

/** Consonants only, for "sounds like": agothy ~ agathe. */
const skeleton = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "").replace(/[aeiouy]+/g, "").replace(/(.)\1+/g, "$1");

interface Token { word: string; sep: string }
function tokens(text: string): { lead: string; list: Token[] } {
  const lead = text.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? "";
  const list = [...text.slice(lead.length).matchAll(/([\p{L}\p{N}'’-]+)([^\p{L}\p{N}'’-]*)/gu)].map(m => ({ word: m[1], sep: m[2] }));
  return { lead, list };
}

/**
 * Keep the plain transcript, word for word and with its punctuation, and take
 * from the name-biased one only single-word swaps to a known name that sounds
 * alike. Nothing is added, dropped, renumbered or negated.
 */
export function correctVoiceTerms(original: string, candidate: string, vocabulary: string[]): string {
  const allowed = new Map(vocabulary.map(w => [w.toLowerCase(), w]));
  const a = tokens(original), b = tokens(candidate);
  const x = a.list.map(t => t.word.toLowerCase()), y = b.list.map(t => t.word.toLowerCase());
  // longest common subsequence of words
  const lcs = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = a.list.map(t => ({ ...t }));
  let i = 0, j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      // same word: take a known name's capitalisation
      if (allowed.has(y[j]) && !protectedTerm(x[i])) out[i].word = allowed.get(y[j])!;
      i++; j++; continue;
    }
    // a gap: words only in one transcript
    const gi = i, gj = j;
    while (i < x.length && (j >= y.length || lcs[i + 1][j] >= lcs[i][j + 1]) && !(j < y.length && x[i] === y[j])) i++;
    while (j < y.length && (i >= x.length || x[i] !== y[j]) && (i >= x.length || lcs[i][j + 1] >= lcs[i + 1]?.[j])) j++;
    if (i === gi && j === gj) { if (i < x.length) i++; else j++; continue; }
    if (i - gi === 1 && j - gj === 1) {
      const from = x[gi], to = y[gj];
      const known = allowed.get(to);
      const alike = distance(from, to) <= Math.max(1, Math.floor(Math.max(from.length, to.length) * 0.35)) || (skeleton(from) === skeleton(to) && from[0] === to[0]);
      if (known && alike && !protectedTerm(from) && !protectedTerm(to)) out[gi].word = known;
    }
  }
  return (a.lead + out.map(t => t.word + t.sep).join("")).trim();
}

/**
 * Spoken layout commands. Only ones that can't be prose: "new paragraph",
 * "new line", "open quote" / "close quote". Punctuation words ("comma",
 * "period") stay words; the recogniser punctuates on its own.
 */
export function applySpokenCommands(text: string): string {
  return text
    .replace(/,?\s*\b(?:new paragraph|next paragraph)\b[,.;:]?\s*/gi, "\n\n")
    .replace(/,?\s*\bnew line\b[,.;:]?\s*/gi, "\n")
    .replace(/\s*\b(?:open quote|begin quote)\b[,.]?\s*/gi, " “")
    .replace(/[,.]?\s*\b(?:close quote|end quote|unquote)\b/gi, "”")
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/^\s+|\s+$/g, "")
    .replace(/(^|\n)(\p{Ll})/gu, (_, br, c) => br + c.toUpperCase());
}

/** The book's typographic choices for quotes, ellipses and dashes. Spelling stays as spoken. */
export function applyHouseStyle(text: string, style: HouseStyle = {}): string {
  let out = text;
  const [open, close, innerOpen, innerClose] = style.quotes === "single" ? ["‘", "’", "“", "”"] : ["“", "”", "‘", "’"];
  out = out.replace(/(^|[\s(\[—–-])"/g, `$1${open}`).replace(/"/g, close);
  out = out.replace(/(\p{L})'(\p{L})/gu, "$1’$2").replace(/(^|[\s(\[—–-])'/g, `$1${innerOpen}`).replace(/'/g, innerClose);
  if (style.quotes === "single") out = out.replace(/“/g, "\u0000").replace(/”/g, "\u0001").replace(/\u0000/g, "‘").replace(/\u0001/g, "’");
  if (style.ellipsis !== "dots") out = out.replace(/\.\.\./g, "…");
  if (style.dashes === "em-closed") out = out.replace(/\s+--\s+|\s+—\s+/g, "—");
  else if (style.dashes === "en-spaced") out = out.replace(/\s*--\s*|\s*—\s*/g, " – ");
  return out;
}

/** The words of a text, ignoring case and punctuation. */
const wordsOf = (t: string) => (t.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).map(w => w.replace(/’/g, "'"));

/** Whether a tidied transcript only changed punctuation, capitals and spacing, without inventing paragraph breaks. */
export function onlyPunctuationChanged(before: string, after: string): boolean {
  const a = wordsOf(before), b = wordsOf(after);
  if (a.length !== b.length || !a.every((w, i) => w === b[i])) return false;
  const beforeParas = before.trim().split(/\n{2,}/).length;
  const afterParas = after.trim().split(/\n{2,}/).length;
  return afterParas === beforeParas;
}

/** Text to read aloud, in chunks of whole paragraphs (the last chunk may be one long paragraph). */
export function readingChunks(paragraphs: string[], max = 1200): Array<{ text: string; first: number; last: number }> {
  const chunks: Array<{ text: string; first: number; last: number }> = [];
  let current: { text: string; first: number; last: number } | null = null;
  paragraphs.forEach((p, i) => {
    const text = p.trim();
    if (!text) return;
    if (current && current.text.length + text.length + 2 <= max) { current.text += "\n\n" + text; current.last = i; return; }
    if (current) chunks.push(current);
    // a very long paragraph is split at sentence ends
    if (text.length > max * 1.6) {
      let rest = text;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(". ", max) > max / 2 ? rest.lastIndexOf(". ", max) + 1 : max;
        chunks.push({ text: rest.slice(0, cut).trim(), first: i, last: i });
        rest = rest.slice(cut);
      }
      current = { text: rest.trim(), first: i, last: i };
    } else current = { text, first: i, last: i };
  });
  if (current) chunks.push(current);
  return chunks;
}
