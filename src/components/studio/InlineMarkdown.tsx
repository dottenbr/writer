import { useMemo } from "react";
import { CHAPTER_ANCHOR } from "../../lib/book-model";

/** One line of Markdown shown as text: emphasis, and chapter anchors that link. */
export function InlineMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_]+?)_(?!\w)/g, "$1<em>$2</em>")
      .replace(new RegExp(CHAPTER_ANCHOR.source, "g"), (m, list) => `<span class="chapter-ref" data-chapters="${list}">${m}</span>`);
  }, [text]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
