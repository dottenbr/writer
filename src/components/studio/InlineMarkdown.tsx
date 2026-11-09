import { useMemo } from "react";
import { CHAPTER_ANCHOR } from "../../lib/book-model";
import { staticChips } from "../../lib/static-chips";
import { useBookStore } from "../../store/useBookStore";
import { staticChipContext } from "./useSources";

/** One line of Markdown shown as text: emphasis, anchors as chips, loose chapter mentions that link. */
export function InlineMarkdown({ text }: { text: string }) {
  const model = useBookStore(s => s.model);
  const html = useMemo(() => {
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const codes: string[] = [];
    const marked = esc
      .replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${codes.push(c) - 1}\u0000`)
      .replace(/(?<!!)\[([^\]]+)\]\([^)\s]+\)/g, '<span class="inline-link">$1</span>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_]+?)_(?!\w)/g, "$1<em>$2</em>");
    const chipped = staticChips(marked, staticChipContext()).replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
    // loose mentions ("in Ch. 4") outside chips still link
    return chipped.split(/(<[^>]+>[^<]*<\/span>|<[^>]+>)/).map((part, i) => (i % 2 ? part : part.replace(new RegExp(CHAPTER_ANCHOR.source, "g"), (m, list) => `<span class="chapter-ref" data-chapters="${list}">${m}</span>`))).join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, model]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
