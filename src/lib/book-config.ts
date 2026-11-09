/**
 * book.yaml as the book's configuration: read it, change it, keep it tidy.
 *
 * Edits go through the yaml Document API, so comments, untouched values and
 * the file's own formatting survive. The schema follows the bookkit standard
 * (bookkit/templates/book.yaml.example): kind, byline, ai_policy and the house
 * style block.
 */
import { isMap, isScalar, parseDocument, Scalar, type Document, YAMLMap } from "yaml";

export type BookKind = "fiction" | "nonfiction";
export type Byline = "own-name" | "pen-name";

export interface HouseStyle {
  spelling?: "american" | "british" | "oxford";
  serial_comma?: boolean;
  quotes?: "double" | "single";
  punctuation_in_quotes?: "american" | "logical";
  dashes?: "em-closed" | "en-spaced" | "none";
  ellipsis?: "character" | "dots";
  numbers?: "words" | "words-to-ten" | "words-to-hundred" | "numerals";
  manual?: "chicago" | "new-oxford" | "ap" | "none";
}
export type StyleKey = keyof HouseStyle;

/** Every style setting, with the words people see. */
export const STYLE_FIELDS: Array<{ key: StyleKey; label: string; choices: Array<{ value: string | boolean; label: string; example?: string }> }> = [
  { key: "spelling", label: "Spelling", choices: [
    { value: "american", label: "American", example: "color, center, traveled" },
    { value: "british", label: "British", example: "colour, centre, realise" },
    { value: "oxford", label: "Oxford (British, -ize)", example: "colour, centre, realize" },
  ] },
  { key: "serial_comma", label: "Serial comma", choices: [
    { value: true, label: "Yes", example: "bread, wine, and salt" },
    { value: false, label: "No", example: "bread, wine and salt" },
  ] },
  { key: "quotes", label: "Quotation marks", choices: [
    { value: "double", label: "Double", example: "“She said ‘no’.”" },
    { value: "single", label: "Single", example: "‘She said “no”.’" },
  ] },
  { key: "punctuation_in_quotes", label: "Commas and periods", choices: [
    { value: "american", label: "Inside the quotes", example: "“no,” she said." },
    { value: "logical", label: "Logical", example: "the word ‘no’, she said." },
  ] },
  { key: "dashes", label: "Dashes", choices: [
    { value: "em-closed", label: "Em dash, closed", example: "word—word" },
    { value: "en-spaced", label: "En dash, spaced", example: "word – word" },
    { value: "none", label: "None in the text" },
  ] },
  { key: "ellipsis", label: "Ellipsis", choices: [
    { value: "character", label: "One character", example: "…" },
    { value: "dots", label: "Three dots", example: "..." },
  ] },
  { key: "numbers", label: "Numbers", choices: [
    { value: "words", label: "Words", example: "forty-one" },
    { value: "words-to-hundred", label: "Words to one hundred", example: "ninety-nine, 101" },
    { value: "words-to-ten", label: "Words to ten", example: "nine, 11" },
    { value: "numerals", label: "Numerals", example: "41" },
  ] },
  { key: "manual", label: "Style manual", choices: [
    { value: "chicago", label: "Chicago" },
    { value: "new-oxford", label: "New Oxford" },
    { value: "ap", label: "AP" },
    { value: "none", label: "None" },
  ] },
];
export const STYLE_KEYS = STYLE_FIELDS.map(f => f.key);

export interface BookConfigView {
  title: string;
  subtitle: string;
  author: string;
  byline: Byline;
  language: string;
  kind: BookKind;
  aiPolicy: string | null;
  styleInherit: "own" | "shelf";
  style: HouseStyle;
  layout: "flat" | "parts";
  scenes: boolean;
  formats: string[];
  titlePage: boolean;
  chapterHeading: string;
}

/** Top-level keys in the order bookkit's template uses. */
export const KEY_ORDER = ["slug", "title", "subtitle", "author", "byline", "language", "kind", "ai_policy", "style", "manuscript", "lint", "publication", "citations", "companion"];
const SPELLING_STYLES: Record<string, string | undefined> = { american: "AmericanSpelling", oxford: "OxfordSpelling", british: undefined };
const OUT = { flowCollectionPadding: false, lineWidth: 0 } as const;

const doc = (yaml: string) => parseDocument(yaml, { keepSourceTokens: false });
const str = (v: unknown) => (v == null ? "" : String(v));

export function readConfig(yaml: string): BookConfigView {
  const d = doc(yaml);
  const js = (d.toJS() ?? {}) as Record<string, any>;
  const style = (js.style ?? {}) as Record<string, unknown>;
  const picked: HouseStyle = {};
  for (const key of STYLE_KEYS) if (style[key] != null) (picked as Record<string, unknown>)[key] = style[key];
  return {
    title: str(js.title),
    subtitle: str(js.subtitle),
    author: str(js.author),
    byline: js.byline === "pen-name" ? "pen-name" : "own-name",
    language: str(js.language) || "en-US",
    kind: (js.kind ?? js.companion?.kind) === "nonfiction" ? "nonfiction" : "fiction",
    aiPolicy: js.ai_policy ? String(js.ai_policy) : null,
    styleInherit: style.inherit === "shelf" ? "shelf" : "own",
    style: picked,
    layout: js.manuscript?.layout === "parts" ? "parts" : "flat",
    scenes: !!js.manuscript?.scenes,
    formats: Array.isArray(js.publication?.formats) ? js.publication.formats.map(String) : [],
    titlePage: !!js.publication?.title_page,
    chapterHeading: str(js.publication?.chapter_heading),
  };
}

function ensureMap(d: Document, key: string): YAMLMap {
  let node = d.get(key, true);
  if (!isMap(node)) {
    node = new YAMLMap();
    d.set(key, node);
  }
  return node as YAMLMap;
}

/** Put top-level keys in bookkit's order; unknown keys keep their order after the known ones. */
function tidy(d: Document) {
  const root = d.contents;
  if (!isMap(root)) return;
  const rank = (k: unknown) => { const i = KEY_ORDER.indexOf(String((k as { value?: unknown })?.value ?? k)); return i < 0 ? KEY_ORDER.length : i; };
  const items = [...root.items];
  const sorted = items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item.key) - rank(b.item.key) || a.i - b.i).map(x => x.item);
  // block mappings read best with a blank line before them
  sorted.forEach((item, i) => {
    if (!isScalar(item.key)) item.key = new Scalar(item.key);
    const k = item.key as Scalar;
    if (i > 0 && isMap(item.value) && !k.commentBefore) k.spaceBefore = true;
  });
  root.items = sorted;
}

export interface ConfigPatch {
  title?: string; subtitle?: string; author?: string; byline?: Byline; language?: string; kind?: BookKind;
  aiPolicy?: string;
  styleInherit?: "own" | "shelf"; style?: HouseStyle;
  layout?: "flat" | "parts"; scenes?: boolean; formats?: string[]; titlePage?: boolean; chapterHeading?: string;
}

/** Apply a change to book.yaml and return the new text, in bookkit's key order. */
export function updateConfig(yaml: string, patch: ConfigPatch): string {
  const d = doc(yaml);
  const set = (key: string, value: unknown) => { if (value === "" || value == null) d.delete(key); else d.set(key, value); };
  if (patch.title != null) set("title", patch.title);
  if (patch.subtitle != null) set("subtitle", patch.subtitle);
  if (patch.author != null) set("author", patch.author);
  if (patch.byline) d.set("byline", patch.byline);
  if (patch.language) d.set("language", patch.language);
  if (patch.kind) {
    d.set("kind", patch.kind);
    if (d.hasIn(["companion", "kind"])) d.setIn(["companion", "kind"], patch.kind);
  }
  if (patch.aiPolicy) d.set("ai_policy", patch.aiPolicy);
  if (patch.style || patch.styleInherit) {
    const style = ensureMap(d, "style");
    if (patch.styleInherit) style.set("inherit", patch.styleInherit);
    for (const [key, value] of Object.entries(patch.style ?? {})) {
      if (value == null) style.delete(key); else style.set(key, value);
    }
    // keep keys in the template's order
    const order = ["inherit", ...STYLE_KEYS] as string[];
    style.items.sort((a, b) => order.indexOf(String((a.key as { value?: unknown }).value)) - order.indexOf(String((b.key as { value?: unknown }).value)));
    // the Vale spelling check follows the declared spelling
    const spelling = patch.style?.spelling;
    if (spelling && d.hasIn(["lint", "vale", "styles"])) {
      const styles = (d.getIn(["lint", "vale", "styles"], true) as { items: Array<{ value: unknown }> });
      const names = styles.items.map(i => String(i.value ?? i));
      const without = names.filter(n => !Object.values(SPELLING_STYLES).includes(n));
      const wanted = SPELLING_STYLES[spelling];
      const next = wanted ? [...without.slice(0, without.indexOf("Vale") >= 0 ? without.indexOf("Vale") : without.length), wanted, ...without.slice(without.indexOf("Vale") >= 0 ? without.indexOf("Vale") : without.length)] : without;
      if (next.join() !== names.join()) {
        const node = d.createNode(next);
        (node as { flow?: boolean }).flow = true;
        d.setIn(["lint", "vale", "styles"], node);
      }
    }
  }
  if (patch.layout) d.setIn(["manuscript", "layout"], patch.layout);
  if (patch.scenes != null) d.setIn(["manuscript", "scenes"], patch.scenes);
  if (patch.formats) { const node = d.createNode(patch.formats); (node as { flow?: boolean }).flow = true; d.setIn(["publication", "formats"], node); }
  if (patch.titlePage != null) d.setIn(["publication", "title_page"], patch.titlePage);
  if (patch.chapterHeading != null) d.setIn(["publication", "chapter_heading"], patch.chapterHeading);
  tidy(d);
  return d.toString(OUT);
}

/** Only re-order the file into bookkit's layout. */
export function tidyConfig(yaml: string): string {
  const d = doc(yaml);
  tidy(d);
  return d.toString(OUT);
}

/** The style a book follows: its shelf's when it inherits (and the shelf has one), else its own. */
export function effectiveStyle(view: BookConfigView, shelfStyle?: HouseStyle | null): HouseStyle {
  return view.styleInherit === "shelf" && shelfStyle ? shelfStyle : view.style;
}

export const sameStyle = (a: HouseStyle, b: HouseStyle) => STYLE_KEYS.every(k => (a[k] ?? null) === (b[k] ?? null));

/** Write the shelf's style into a book that inherits it. Returns the text unchanged when nothing differs. */
export function applyShelfStyle(yaml: string, shelfStyle: HouseStyle): string {
  const view = readConfig(yaml);
  if (view.styleInherit !== "shelf" || sameStyle(view.style, shelfStyle)) return yaml;
  const style: HouseStyle = {};
  for (const key of STYLE_KEYS) (style as Record<string, unknown>)[key] = shelfStyle[key] ?? null;
  return updateConfig(yaml, { style });
}
