import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type BibleRefSection = "characters" | "threads" | "locations" | "codex";

export interface BibleRefEntry {
  id: string;
  section: BibleRefSection;
  name: string;
  aliases: string[];
  summary: string;
}

export interface BibleHighlightOptions {
  getEntries: () => BibleRefEntry[];
}

export const REBUILD_BIBLE_HIGHLIGHTS_META = "rebuildBibleHighlights";

const bibleHighlightKey = new PluginKey<DecorationSet>("bibleHighlight");

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionLabel(section: BibleRefSection): string {
  switch (section) {
    case "characters":
      return "Character";
    case "threads":
      return "Thread";
    case "locations":
      return "Location";
    case "codex":
      return "Codex";
    default:
      return "Entry";
  }
}

function buildTermMap(entries: BibleRefEntry[]): {
  regex: RegExp | null;
  byTerm: Map<string, BibleRefEntry>;
} {
  const terms: string[] = [];
  const byTerm = new Map<string, BibleRefEntry>();

  for (const entry of entries) {
    const candidates = [entry.name, ...(entry.aliases ?? [])];
    for (const raw of candidates) {
      const text = raw.trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase();
      if (byTerm.has(key)) continue;
      byTerm.set(key, entry);
      terms.push(text);
    }
  }

  if (terms.length === 0) {
    return { regex: null, byTerm };
  }

  terms.sort((a, b) => b.length - a.length);
  const pattern = terms.map((term) => escapeRegex(term)).join("|");
  return {
    regex: new RegExp(`\\b(?:${pattern})\\b`, "g"),
    byTerm,
  };
}

function shouldRebuild(transaction: Transaction): boolean {
  return Boolean(transaction.getMeta(REBUILD_BIBLE_HIGHLIGHTS_META));
}

function buildDecorations(doc: ProseMirrorNode, entries: BibleRefEntry[]): DecorationSet {
  const { regex, byTerm } = buildTermMap(entries);
  if (!regex) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? "";
    if (!text.trim()) return true;

    regex.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      const matchedText = match[0];
      const matchedEntry = byTerm.get(matchedText.toLocaleLowerCase());
      if (!matchedEntry) continue;

      const from = pos + match.index;
      const to = from + matchedText.length;
      const summary = matchedEntry.summary?.trim() ?? "";
      const title = summary
        ? `${matchedEntry.name} (${sectionLabel(matchedEntry.section)}): ${summary}`
        : `${matchedEntry.name} (${sectionLabel(matchedEntry.section)})`;

      decorations.push(
        Decoration.inline(
          from,
          to,
          {
            class: "bible-ref",
            "data-bible-id": matchedEntry.id,
            "data-bible-section": matchedEntry.section,
            "data-bible-label": sectionLabel(matchedEntry.section),
            "data-bible-name": matchedEntry.name,
            title,
          },
          { inclusiveStart: false, inclusiveEnd: false }
        )
      );
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export const BibleHighlight = Extension.create<BibleHighlightOptions>({
  name: "bibleHighlight",

  addOptions() {
    return {
      getEntries: () => [],
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: bibleHighlightKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc, this.options.getEntries()),
          apply: (tr, old, _, state) => {
            if (tr.docChanged || shouldRebuild(tr)) {
              return buildDecorations(state.doc, this.options.getEntries());
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
