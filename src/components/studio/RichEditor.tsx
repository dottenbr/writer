import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { bookExtensions, bookLinksKey, type LinkConfig } from "../../lib/editor-extensions";
import { docToMarkdown, markdownToHtml, nodeToMarkdown, type JSONNode } from "../../lib/markdown-doc";

export interface RichEditorHandle {
  editor: Editor | null;
}

interface Props {
  /** Markdown body (front matter and title removed). */
  body: string;
  reloadKey: string | number;
  editable: boolean;
  placeholder?: string;
  links: LinkConfig;
  onChange?: (body: string) => void;
  onReady?: (editor: Editor) => void;
  onSelection?: (text: string) => void;
  /** Click position to place the caret at after mounting. */
  initialPoint?: { x: number; y: number } | null;
  className?: string;
}

/** A Google-Docs-like surface for one Markdown body. Writes back Markdown with untouched blocks preserved. */
export function RichEditor({ body, reloadKey, editable, placeholder, links, onChange, onReady, onSelection, initialPoint, className }: Props) {
  const original = useRef<{ canonical: string[]; blocks: string[]; prefix: string } | null>(null);
  const loading = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const [, force] = useState(0);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  const editor = useEditor({
    extensions: bookExtensions(placeholder ?? "Start writing…"),
    editable,
    editorProps: { attributes: () => ({ class: "doc-prose", spellcheck: editableRef.current ? "true" : "false" }) },
    onUpdate: ({ editor }) => {
      if (loading.current) return;
      const md = docToMarkdown(editor.getJSON() as JSONNode, original.current ?? undefined);
      onChangeRef.current?.(md);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      onSelectionRef.current?.(from === to ? "" : editor.state.doc.textBetween(from, to, "\n"));
      force(x => x + 1);
    },
  });

  // (Re)load content from Markdown when the document or remote text changes.
  useEffect(() => {
    if (!editor) return;
    const parsed = markdownToHtml(body);
    loading.current = true;
    const selection = editor.state.selection;
    editor.commands.setContent(parsed.html, false, { preserveWhitespace: false });
    const json = editor.getJSON() as JSONNode;
    const canonical = (json.content ?? []).map(nodeToMarkdown);
    original.current = canonical.length === parsed.blocks.length ? { canonical, blocks: parsed.blocks, prefix: parsed.prefix } : null;
    try {
      const max = editor.state.doc.content.size;
      if (selection.from <= max && editor.isFocused) editor.commands.setTextSelection({ from: Math.min(selection.from, max), to: Math.min(selection.to, max) });
    } catch { /* selection outside new doc */ }
    loading.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, reloadKey]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    editor.view.dom.setAttribute("spellcheck", editable ? "true" : "false");
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.storage.bookLinks.config = links;
    editor.view.dispatch(editor.state.tr.setMeta(bookLinksKey, true));
  }, [editor, links]);

  useEffect(() => {
    if (!editor) return;
    onReady?.(editor);
    if (initialPoint) {
      requestAnimationFrame(() => {
        const pos = editor.view.posAtCoords({ left: initialPoint.x, top: initialPoint.y });
        if (pos) editor.chain().focus().setTextSelection(pos.pos).run();
        else editor.commands.focus("start");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return <EditorContent editor={editor} className={className} />;
}

/** Wrap bible names in static HTML so linked names read the same whether or not a chapter is being edited. */
function linkEntities(html: string, matcher?: { regex: RegExp | null; byAlias: Map<string, { id: string; kind: string }> }) {
  if (!matcher?.regex || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if (!n.parentElement?.closest("h1,h2,h3,h4,pre,code,a")) nodes.push(n);
  }
  for (const node of nodes) {
    const text = node.data;
    matcher.regex.lastIndex = 0;
    const matches = [...text.matchAll(matcher.regex)];
    if (!matches.length) continue;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const m of matches) {
      const e = matcher.byAlias.get(m[0]);
      if (!e) continue;
      frag.append(text.slice(at, m.index));
      const span = doc.createElement("span");
      span.className = `entity-ref entity-${e.kind}`;
      span.dataset.entity = e.id;
      span.textContent = m[0];
      frag.append(span);
      at = m.index! + m[0].length;
    }
    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
  return root.innerHTML;
}

/** Static rendering identical to the editor's, for chapters not being edited. */
export function StaticProse({ body, className, onActivate, matcher }: { body: string; className?: string; onActivate?: (point: { x: number; y: number }) => void; matcher?: Parameters<typeof linkEntities>[1] }) {
  const html = useMemo(() => linkEntities(markdownToHtml(body).html.replace(/<div data-raw-md="([^"]*)"><\/div>/g, (_, src) => `<pre class="raw-md">${src}</pre>`), matcher), [body, matcher]);
  return (
    <div
      className={`doc-prose static ${className ?? ""}`}
      onMouseUp={e => {
        if (window.getSelection()?.toString()) return;
        if ((e.target as HTMLElement).closest("[data-entity],a")) return;
        onActivate?.({ x: e.clientX, y: e.clientY });
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
