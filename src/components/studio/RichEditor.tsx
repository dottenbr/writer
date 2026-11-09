import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { createRoot } from "react-dom/client";
import { bookExtensions, bookLinksKey, sceneSlotsKey, type LinkConfig } from "../../lib/editor-extensions";
import { SceneCardInline } from "./SceneCardInline";
import { docToMarkdown, escapeHtml, markdownToHtml, nodeToMarkdown, type JSONNode } from "../../lib/markdown-doc";
import { useBookStore } from "../../store/useBookStore";
import { useEditorBus } from "./editorBus";
import { parseScenes } from "../../lib/scene-cards";

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
  /** Show this scene-card file's cards at the top of each scene. */
  scenes?: { path: string; count: number };
}

/** A Google-Docs-like surface for one Markdown body. Writes back Markdown with untouched blocks preserved. */
export function RichEditor({ body, reloadKey, editable, placeholder, links, onChange, onReady, onSelection, initialPoint, className, scenes }: Props) {
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
      if (from === to) {
        if (editor.isFocused) onSelectionRef.current?.("");
      } else {
        onSelectionRef.current?.(editor.state.doc.textBetween(from, to, "\n"));
      }
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
    const path = scenes?.path;
    editor.storage.sceneSlots.config = {
      count: scenes?.count ?? 0,
      render: path ? (index: number, el: HTMLElement, waiting: boolean) => {
        const root = createRoot(el);
        const beginScene = () => {
          const state = useBookStore.getState();
          const useHeadings = Boolean(state.model?.config?.manuscript?.scenes);
          const scenesRaw = state.files.find(f => f.path === path)?.content;
          const card = scenesRaw ? parseScenes(scenesRaw)[index] : undefined;
          if (useHeadings && card) {
            editor.chain().focus("end").insertContent(`<h2>${escapeHtml(card.heading)}</h2><p></p>`).run();
          } else {
            editor.chain().focus("end").setHorizontalRule().run();
          }
        };
        root.render(<SceneCardInline path={path} index={index} waiting={waiting} onBegin={waiting && editor.isEditable ? beginScene : undefined} />);
        return () => setTimeout(() => root.unmount(), 0);
      } : null,
    };
    editor.view.dispatch(editor.state.tr.setMeta(sceneSlotsKey, true));
  }, [editor, scenes?.path, scenes?.count]);

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
export function StaticProse({ body, className, onActivate, matcher, scenesPath }: { body: string; className?: string; onActivate?: (point: { x: number; y: number }) => void; matcher?: Parameters<typeof linkEntities>[1]; scenesPath?: string }) {
  const html = useMemo(() => linkEntities(markdownToHtml(body).html.replace(/<div data-raw-md="([^"]*)"><\/div>/g, (_, src) => `<pre class="raw-md">${src}</pre>`), matcher), [body, matcher]);
  const scenesFile = useBookStore(s => (scenesPath ? s.files.find(f => f.path === scenesPath)?.content : undefined));
  const count = useMemo(() => (scenesFile ? parseScenes(scenesFile).length : 0), [scenesFile]);
  const activate = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      useEditorBus.getState().setSelection(sel);
      return;
    }
    if ((e.target as HTMLElement).closest("[data-entity],[data-chapters],a,.scene-inline")) return;
    onActivate?.({ x: e.clientX, y: e.clientY });
  };
  if (!scenesPath || !count) return <div className={`doc-prose static ${className ?? ""}`} onMouseUp={activate} dangerouslySetInnerHTML={{ __html: html }} />;
  // Scenes are the stretches between scene breaks; each gets its card on top.
  // Scenes start at "## Scene N" headings in books that title them, otherwise after each scene break.
  const titled = /<h2[^>]*>\s*Scene\s+\d+/i.test(html);
  let scenes: string[];
  if (titled) {
    const parts = html.split(/(?=<h2[^>]*>\s*Scene\s+\d+)/i);
    scenes = /<h2[^>]*>\s*Scene/i.test(parts[0]) ? parts : [parts[0] + (parts[1] ?? ""), ...parts.slice(2)];
  } else {
    scenes = [""];
    for (const part of html.split(/(<hr[^>]*>)/)) { if (/^<hr/.test(part)) scenes.push(part); else scenes[scenes.length - 1] += part; }
  }
  return (
    <div className={`doc-prose static ${className ?? ""}`} onMouseUp={activate}>
      {scenes.map((chunk, i) => (
        <div key={i} className="static-scene">
          {i > 0 && !titled && <hr />}
          {i < count && <SceneCardInline path={scenesPath} index={i} />}
          <div dangerouslySetInnerHTML={{ __html: i > 0 ? chunk.replace(/^<hr[^>]*>/, "") : chunk }} />
        </div>
      ))}
      {Array.from({ length: Math.max(0, count - scenes.length) }, (_, k) => <SceneCardInline key={`extra-${k}`} path={scenesPath} index={scenes.length + k} />)}
    </div>
  );
}
