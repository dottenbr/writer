/**
 * Markup that the files keep as text but the editor shows as objects:
 * chapter anchors (chips beside the fact), footnotes (numbered markers and
 * notes), citations (short cites) and Pandoc line-block bars (hidden).
 * The line the caret is in shows its raw text, so it can be edited directly.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { anchorLabel, findAnchors, splitFact, type Anchor, type ResolvedAnchor } from "./anchors";
import { CITATION, pandocMarks } from "./pandoc-marks";
import { parseCitation, type CiteItem } from "./bibliography";

export type ChipKind = "anchor" | "anchors" | "footnote" | "note" | "cite";

export interface ChipEvent {
  kind: ChipKind;
  view: EditorView;
  /** Document position of the chip. */
  at: number;
  /** Which anchor (in the block, in order) or citation was clicked. */
  index: number;
  id?: string;
  rect: DOMRect;
}

export interface ChipConfig {
  anchors?: boolean;
  editable?: boolean;
  resolve?: (a: Anchor) => ResolvedAnchor;
  cite?: (item: CiteItem) => { short: string; full?: string; known: boolean };
  onChip?: (e: ChipEvent) => void;
}

export const markupChipsKey = new PluginKey<ChipState>("markupChips");

interface ChipState {
  set: DecorationSet;
  active: number | null;
  focused: boolean;
  notes: Notes;
}

interface Notes { order: Map<string, number>; text: Map<string, string>; sig: string }

const FN_REF = /\[\^([^\]\s]+)\](?!:)/g;
const FN_DEF = /^\[\^([^\]\s]+)\]:[ \t]*/;

/** Footnote numbers (by first reference) and texts (from definitions). */
function scanNotes(doc: PMNode): Notes {
  const order = new Map<string, number>();
  const text = new Map<string, string>();
  doc.descendants(node => {
    if (!node.isTextblock) return true;
    const t = node.textContent;
    if (!t.includes("[^")) return false;
    const def = t.match(FN_DEF);
    if (def) text.set(def[1], t.slice(def[0].length));
    for (const m of t.matchAll(FN_REF)) if (!(def && m.index === 0) && !order.has(m[1])) order.set(m[1], order.size + 1);
    return false;
  });
  for (const id of text.keys()) if (!order.has(id)) order.set(id, order.size + 1);
  return { order, text, sig: [...order.keys()].join("|") + "§" + [...text.values()].join("|") };
}

/**
 * A textblock's text with italics written back as `*…*` (anchors are italic in
 * the editor), and the document position of every character. Inserted asterisks
 * are "virtual": they sit at the boundary of the italic run.
 */
export function blockText(node: PMNode, pos: number) {
  let text = "";
  const offsets: number[] = [];
  const virtual: boolean[] = [];
  let italic = false;
  let at = pos + 1;
  const toggle = (on: boolean) => { if (on !== italic) { text += "*"; offsets.push(at); virtual.push(true); italic = on; } };
  node.forEach((child, offset) => {
    at = pos + 1 + offset;
    if (child.isText) {
      toggle(child.marks.some(m => m.type.name === "italic"));
      for (let i = 0; i < child.text!.length; i++) { offsets.push(at + i); virtual.push(false); }
      text += child.text;
      at += child.text!.length;
    } else {
      toggle(false);
      offsets.push(at); virtual.push(false);
      text += "\n";
      at += child.nodeSize;
    }
  });
  at = pos + node.nodeSize - 1;
  toggle(false);
  /** Document range of text[from, to). */
  const range = (from: number, to: number): [number, number] => {
    const start = from < offsets.length ? offsets[from] : pos + node.nodeSize - 1;
    if (to <= from) return [start, start];
    const last = to - 1;
    return [start, virtual[last] ? offsets[last] : offsets[last] + 1];
  };
  return { text, offsets, virtual, range };
}

function chipEl(tag: string, className: string, label: string, title: string, onDown: (el: HTMLElement) => void) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = label;
  if (title) el.title = title;
  el.contentEditable = "false";
  el.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); onDown(el); });
  return el;
}

function anchorChip(a: Anchor, cfg: ChipConfig) {
  const r = cfg.resolve?.(a);
  const status = r?.status ?? "ok";
  const where = r?.chapter ? `Chapter ${r.chapter.number}${r.chapter.title ? `: ${r.chapter.title}` : ""}${r.scene ? ` · Scene ${r.scene}${r.sceneTitle ? `: ${r.sceneTitle}` : ""}` : ""}` : "";
  const title = [where, a.quote ? `“${a.quote}”` : "", r?.problem ?? ""].filter(Boolean).join("\n");
  return { status: status + (a.quote ? " has-quote" : ""), title, label: anchorLabel(a) };
}

function blockDecos(node: PMNode, pos: number, cfg: ChipConfig, active: boolean, notes: Notes, out: Decoration[]) {
  const { text, range } = blockText(node, pos);
  if (!text || active) return;
  const end = pos + node.nodeSize - 1;
  const at = (i: number) => range(i, i)[0];
  const hide = (s: number, e: number, cls = "mk-src") => { const [a, b] = range(s, e); if (b > a) out.push(Decoration.inline(a, b, { class: cls })); };
  const fire = (kind: ChipKind, index: number, id: string | undefined) => (view: EditorView, getPos: () => number | undefined) => (el: HTMLElement) => {
    const p = getPos();
    if (p != null) cfg.onChip?.({ kind, view, at: p, index, id, rect: el.getBoundingClientRect() });
  };
  const widget = (p: number, side: number, key: string, make: (view: EditorView, getPos: () => number | undefined) => HTMLElement) =>
    out.push(Decoration.widget(p, make, { side, key, ignoreSelection: true, stopEvent: () => true }));

  // Footnote definition: "[^id]: text" at the start of a paragraph.
  const def = text.match(FN_DEF);
  if (def) {
    out.push(Decoration.node(pos, pos + node.nodeSize, { class: "fn-def" }));
    hide(0, def[0].length);
    const n = notes.order.get(def[1]) ?? "?";
    widget(at(0), -1, `fnd-${def[1]}-${n}`, (view, getPos) => chipEl("span", "fn-num", String(n), "Footnote", fire("note", 0, def[1])(view, getPos)));
  }
  // Footnote references.
  for (const m of text.matchAll(FN_REF)) {
    if (def && m.index === 0) continue;
    const n = notes.order.get(m[1]) ?? "?";
    const note = notes.text.get(m[1]);
    hide(m.index!, m.index! + m[0].length);
    widget(at(m.index!), -1, `fn-${m[1]}-${n}-${note ?? ""}`, (view, getPos) =>
      chipEl("sup", `fn-ref${note === undefined ? " missing" : ""}`, String(n), note ?? "This footnote has no text yet.", fire("footnote", 0, m[1])(view, getPos)));
  }
  // Citations.
  let ci = 0;
  for (const m of text.matchAll(new RegExp(CITATION.source, "g"))) {
    const items = parseCitation(m[0]);
    const cites = items.map(i => cfg.cite?.(i) ?? { short: `@${i.key}${i.locator ? `, ${i.locator}` : ""}`, known: false });
    const label = cites.map(c => c.short).join("; ");
    const title = cites.map(c => c.full ?? (c.known ? "" : "Not in the book's sources")).filter(Boolean).join("\n\n");
    const index = ci++;
    hide(m.index!, m.index! + m[0].length);
    widget(at(m.index!), -1, `ci-${index}-${label}`, (view, getPos) =>
      chipEl("span", `cite-chip${cites.every(c => c.known) ? "" : " unknown"}`, label, title, fire("cite", index, undefined)(view, getPos)));
  }
  // Line-block bars.
  for (const m of pandocMarks(text)) if (m.kind === "line") hide(m.from, m.to, "md-line-mark");
  // Chapter anchors: a run at the end of the line becomes chips beside the fact; any others, chips in place.
  if (cfg.anchors) {
    const all = findAnchors(text);
    if (!all.length) return;
    const tail = splitFact(text);
    const inTail = all.filter(a => a.from >= tail.tailFrom);
    all.forEach((a, i) => {
      if (a.from >= tail.tailFrom) return;
      const c = anchorChip(a, cfg);
      hide(a.from, a.to);
      widget(at(a.from), -1, `an-${i}-${a.raw}-${c.status}`, (view, getPos) =>
        chipEl("span", `anchor-chip ${c.status}`, c.label, c.title, fire("anchor", i, undefined)(view, getPos)));
    });
    if (inTail.length) {
      hide(tail.tailFrom, text.length);
      const first = all.length - inTail.length;
      const chips = inTail.map(a => anchorChip(a, cfg));
      widget(end, 1, `at-${inTail.map(a => a.raw).join("|")}-${chips.map(c => c.status).join()}`, (view, getPos) => {
        const wrap = document.createElement("span");
        wrap.className = "anchor-chips";
        wrap.contentEditable = "false";
        chips.forEach((c, k) => wrap.appendChild(chipEl("span", `anchor-chip ${c.status}`, c.label, c.title, fire("anchors", first + k, undefined)(view, getPos))));
        return wrap;
      });
    }
  }
}

function activeBlock(state: EditorState, focused: boolean, cfg: ChipConfig): number | null {
  if (!focused || !cfg.editable) return null;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock) return null;
  return $from.before($from.depth);
}

function build(doc: PMNode, cfg: ChipConfig, active: number | null, notes: Notes): DecorationSet {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blockDecos(node, pos, cfg, pos === active, notes, out);
    return false;
  });
  return DecorationSet.create(doc, out);
}

function rebuildRange(state: EditorState, set: DecorationSet, from: number, to: number, cfg: ChipConfig, active: number | null, notes: Notes): DecorationSet {
  const added: Decoration[] = [];
  let next = set;
  state.doc.nodesBetween(Math.max(0, from), Math.min(state.doc.content.size, to), (node, pos) => {
    if (!node.isTextblock) return true;
    const existing = next.find(pos, pos + node.nodeSize);
    if (existing.length) next = next.remove(existing);
    blockDecos(node, pos, cfg, pos === active, notes, added);
    return false;
  });
  return added.length ? next.add(state.doc, added) : next;
}

export const MarkupChips = Extension.create<{}, { config: ChipConfig }>({
  name: "markupChips",
  addStorage() { return { config: {} }; },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [new Plugin<ChipState>({
      key: markupChipsKey,
      state: {
        init: (_, state) => {
          const notes = scanNotes(state.doc);
          return { set: build(state.doc, storage.config, null, notes), active: null, focused: false, notes };
        },
        apply: (tr: Transaction, old, _o, state) => {
          const meta = tr.getMeta(markupChipsKey) as { focus?: boolean; refresh?: boolean } | undefined;
          const focused = meta?.focus ?? old.focused;
          const cfg = storage.config;
          const active = activeBlock(state, focused, cfg);
          if (meta?.refresh) {
            const notes = scanNotes(state.doc);
            return { set: build(state.doc, cfg, active, notes), active, focused, notes };
          }
          let notes = old.notes;
          if (tr.docChanged) {
            notes = scanNotes(state.doc);
            if (notes.sig !== old.notes.sig) return { set: build(state.doc, cfg, active, notes), active, focused, notes };
          }
          const oldActive = old.active == null ? null : tr.mapping.map(old.active, 1);
          if (!tr.docChanged && oldActive === active) return { ...old, focused };
          let set = tr.docChanged ? old.set.map(tr.mapping, state.doc) : old.set;
          if (tr.docChanged) {
            let minFrom = state.doc.content.size, maxTo = 0;
            tr.mapping.maps.forEach((map, i) => {
              const rest = tr.mapping.slice(i + 1);
              map.forEach((_a, _b, s, e) => { minFrom = Math.min(minFrom, rest.map(s, -1)); maxTo = Math.max(maxTo, rest.map(e, 1)); });
            });
            if (minFrom <= maxTo) set = rebuildRange(state, set, minFrom, maxTo, cfg, active, notes);
          }
          for (const p of [oldActive, active]) {
            if (p == null || p > state.doc.content.size) continue;
            const node = state.doc.nodeAt(p);
            if (node) set = rebuildRange(state, set, p, p + node.nodeSize, cfg, active, notes);
          }
          return { set, active, focused, notes };
        },
      },
      props: {
        decorations: state => markupChipsKey.getState(state)?.set,
        handleDOMEvents: {
          focus: view => { view.dispatch(view.state.tr.setMeta(markupChipsKey, { focus: true })); return false; },
          blur: view => { setTimeout(() => { if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(markupChipsKey, { focus: false })); }, 0); return false; },
        },
      },
    })];
  },
});

/** The textblock at a position, with its text and where each character sits. */
export function blockAt(state: EditorState, at: number) {
  const $pos = state.doc.resolve(Math.min(at, state.doc.content.size));
  let depth = $pos.depth;
  while (depth > 0 && !$pos.node(depth).isTextblock) depth--;
  const node = $pos.node(depth);
  if (!node.isTextblock) {
    // a widget at the very end of a block resolves after it
    const before = $pos.nodeBefore;
    if (before?.isTextblock) { const pos = at - before.nodeSize; return { node: before, pos, ...blockText(before, pos) }; }
    return null;
  }
  const pos = $pos.before(depth);
  return { node, pos, ...blockText(node, pos) };
}
