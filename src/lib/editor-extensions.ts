import { Extension, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import HardBreak from "@tiptap/extension-hard-break";
import Link from "@tiptap/extension-link";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { marked } from "marked";
import { CHAPTER_ANCHOR, type Entity } from "./book-model";
import { escapeHtml } from "./markdown-doc";

/** Scene breaks and rules keep the exact markup they were written with. */
const SceneBreak = HorizontalRule.extend({
  addAttributes() {
    return {
      markup: {
        default: "* * *",
        parseHTML: el => el.getAttribute("data-markup") || "* * *",
        renderHTML: attrs => ({ "data-markup": attrs.markup }),
      },
    };
  },
});

/** Line breaks remember whether they were plain newlines in the source. */
const LineBreak = HardBreak.extend({
  addAttributes() {
    return {
      soft: {
        default: false,
        parseHTML: el => el.getAttribute("data-soft") === "1",
        renderHTML: attrs => (attrs.soft ? { "data-soft": "1" } : {}),
      },
    };
  },
});

/** Markdown the editor does not model (tables, HTML) stays verbatim. */
export const RawBlock = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: "", parseHTML: el => el.getAttribute("data-raw-md") ?? "" } };
  },
  parseHTML() { return [{ tag: "div[data-raw-md]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-raw-md": HTMLAttributes.source, class: "raw-md" })];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "raw-md";
      dom.contentEditable = "false";
      const source = String(node.attrs.source ?? "");
      if (/^\s*\|/.test(source)) {
        dom.classList.add("raw-md-table");
        dom.innerHTML = String(marked.parse(escapeHtml(source).replace(/&gt;/g, ">").replace(/&quot;/g, '"'), { async: false, gfm: true }));
      } else {
        const pre = document.createElement("pre");
        pre.textContent = source;
        dom.appendChild(pre);
      }
      return { dom };
    };
  },
});

export interface LinkConfig {
  entities?: { regex: RegExp | null; byAlias: Map<string, Entity> };
  chapterAnchors?: boolean;
  comments?: Array<{ id: string; quote: string; active?: boolean }>;
  flash?: string;
}

export const bookLinksKey = new PluginKey<DecorationSet>("bookLinks");

function buildDecorations(doc: PMNode, config: LinkConfig): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const offsets: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) offsets.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        offsets.push(pos + 1 + offset);
        text += "\n";
      }
    });
    if (!text) return false;
    const range = (start: number, end: number) => [offsets[start], offsets[end - 1] + 1] as const;
    if (config.entities?.regex && node.type.name !== "heading") {
      for (const m of text.matchAll(config.entities.regex)) {
        const e = config.entities.byAlias.get(m[0]);
        if (!e) continue;
        const [from, to] = range(m.index!, m.index! + m[0].length);
        decos.push(Decoration.inline(from, to, { class: `entity-ref entity-${e.kind}`, "data-entity": e.id }));
      }
    }
    if (config.chapterAnchors) {
      for (const m of text.matchAll(CHAPTER_ANCHOR)) {
        const [from, to] = range(m.index!, m.index! + m[0].length);
        decos.push(Decoration.inline(from, to, { class: "chapter-ref", "data-chapters": m[1], title: "⌘-click to open the chapter" }));
      }
    }
    for (const c of config.comments ?? []) {
      const q = c.quote.trim();
      if (q.length < 2) continue;
      let at = text.indexOf(q);
      while (at >= 0) {
        const [from, to] = range(at, at + q.length);
        decos.push(Decoration.inline(from, to, { class: c.active ? "bk-comment active" : "bk-comment", "data-thread": c.id }));
        at = text.indexOf(q, at + q.length);
      }
    }
    if (config.flash) {
      const at = text.toLowerCase().indexOf(config.flash.toLowerCase());
      if (at >= 0) {
        const [from, to] = range(at, at + config.flash.length);
        decos.push(Decoration.inline(from, to, { class: "flash-mark" }));
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export const BookLinks = Extension.create<{}, { config: LinkConfig }>({
  name: "bookLinks",
  addStorage() { return { config: {} }; },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [new Plugin<DecorationSet>({
      key: bookLinksKey,
      state: {
        init: (_, state) => buildDecorations(state.doc, storage.config),
        apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta(bookLinksKey) ? buildDecorations(state.doc, storage.config) : old.map(tr.mapping, tr.doc)),
      },
      props: { decorations: state => bookLinksKey.getState(state) },
    })];
  },
});

export function bookExtensions(placeholder: string) {
  return [
    StarterKit.configure({ horizontalRule: false, hardBreak: false, heading: { levels: [1, 2, 3, 4] } }),
    SceneBreak,
    LineBreak,
    RawBlock,
    Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { rel: "noopener noreferrer", target: null } }),
    Typography.configure({
      oneHalf: false, oneQuarter: false, threeQuarters: false, plusMinus: false, notEqual: false,
      laquo: false, raquo: false, multiplication: false, superscriptTwo: false, superscriptThree: false,
      leftArrow: false, rightArrow: false, copyright: false, trademark: false, registeredTrademark: false, servicemark: false,
    }),
    Placeholder.configure({ placeholder }),
    BookLinks,
  ];
}
