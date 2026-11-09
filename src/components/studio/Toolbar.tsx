import { useEffect, useReducer, useState } from "react";
import { useEditorBus } from "./editorBus";
import { Dictation } from "./Dictation";
import { useListenStore } from "../../store/useListenStore";
import { prefs, useBookStore, writePrefs } from "../../store/useBookStore";
import { chapterForPath, Icon, useAccess } from "./common";

function Btn({ icon, label, active, disabled, onClick, shortcut }: { icon: string; label: string; active?: boolean; disabled?: boolean; onClick: () => void; shortcut?: string }) {
  return (
    <button className={`tb-btn ${active ? "on" : ""}`} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label} aria-label={label} aria-pressed={active}>
      <Icon name={icon} size={16} />
    </button>
  );
}

const mod = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";

export function Toolbar() {
  const model = useBookStore(s => s.model);
  const visible = useBookStore(s => s.visibleChapter);
  const startListening = useListenStore(s => s.start);
  const editor = useEditorBus(s => s.editor);
  const session = useEditorBus(s => s.session);
  const selection = useEditorBus(s => s.selection);
  const requestComment = useEditorBus(s => s.requestComment);
  const setPanel = useBookStore(s => s.setPanel);
  const panelOpen = useBookStore(s => s.panelOpen);
  const togglePanel = useBookStore(s => s.togglePanel);
  const focusMode = useBookStore(s => s.focusMode);
  const setFocusMode = useBookStore(s => s.setFocusMode);
  const { suggesting } = useAccess();
  const [, rerender] = useReducer(x => x + 1, 0);
  const [size, setSizeState] = useState<number>(() => prefs().proseSize ?? 18);
  const [proseFont, setProseFontState] = useState<string>(() => prefs().proseFont ?? "serif");
  const setSize = (n: number) => { const v = Math.max(14, Math.min(24, n)); setSizeState(v); writePrefs({ proseSize: v }); };
  const setProseFont = (f: string) => { setProseFontState(f); writePrefs({ proseFont: f }); };
  useEffect(() => { document.documentElement.style.setProperty("--prose-size", `${size}px`); }, [size]);
  useEffect(() => { document.documentElement.dataset.proseFont = proseFont; }, [proseFont]);

  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", rerender);
    editor.on("focus", rerender);
    editor.on("blur", rerender);
    return () => { editor.off("transaction", rerender); editor.off("focus", rerender); editor.off("blur", rerender); };
  }, [editor]);

  const can = !!editor && editor.isEditable;
  // Formatting shows as "on" only while you're in the text, not for wherever the cursor was left.
  const isOn = (name: string) => !!editor && editor.isFocused && editor.isActive(name);
  const chain = () => editor!.chain().focus();
  const block = !editor ? "p" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : editor.isActive("heading", { level: 4 }) ? "h4" : "p";

  const state = session?.state;
  const readOnly = !!session && !!editor && !editor.isEditable;
  const saveLabel = !session ? "" : readOnly ? "Read only" : state === "saving" ? "Saving…" : state === "dirty" ? "Unsaved" : state === "error" ? "Not saved" : state === "loading" ? "Opening…" : suggesting ? "Saved" : "All changes saved";

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-group">
        <Btn icon="undo" label="Undo" shortcut={`${mod}Z`} disabled={!can || !editor!.can().undo()} onClick={() => chain().undo().run()} />
        <Btn icon="redo" label="Redo" shortcut={`${mod}⇧Z`} disabled={!can || !editor!.can().redo()} onClick={() => chain().redo().run()} />
      </div>
      <span className="tb-sep" />
      <select
        className="tb-select"
        aria-label="Text style"
        disabled={!can}
        value={block}
        onChange={e => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(v.slice(1)) as 2 | 3 | 4 }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h2">Heading</option>
        <option value="h3">Subheading</option>
        <option value="h4">Small heading</option>
      </select>
      <span className="tb-sep" />
      <div className="tb-group">
        <Btn icon="bold" label="Bold" shortcut={`${mod}B`} disabled={!can} active={isOn("bold")} onClick={() => chain().toggleBold().run()} />
        <Btn icon="italic" label="Italic" shortcut={`${mod}I`} disabled={!can} active={isOn("italic")} onClick={() => chain().toggleItalic().run()} />
        <Btn icon="strike" label="Strikethrough" disabled={!can} active={isOn("strike")} onClick={() => chain().toggleStrike().run()} />
      </div>
      <span className="tb-sep" />
      <div className="tb-group">
        <Btn icon="bullets" label="Bulleted list" disabled={!can} active={isOn("bulletList")} onClick={() => chain().toggleBulletList().run()} />
        <Btn icon="numbers" label="Numbered list" disabled={!can} active={isOn("orderedList")} onClick={() => chain().toggleOrderedList().run()} />
        <Btn icon="quote" label="Block quote" disabled={!can} active={isOn("blockquote")} onClick={() => chain().toggleBlockquote().run()} />
        <Btn icon="divider" label="Scene break" disabled={!can} onClick={() => chain().setHorizontalRule().run()} />
      </div>
      <span className="tb-sep" />
      <button className="tb-text-btn" onMouseDown={e => e.preventDefault()} onClick={() => { const sel = selection || window.getSelection()?.toString().trim() || ""; requestComment(sel); setPanel("comments"); }} title="Comment on the selection">
        <Icon name="comment" size={16} /> Comment
      </button>
      <Dictation />
      <button className="tb-btn" onMouseDown={e => e.preventDefault()} title="Listen to this chapter" aria-label="Listen to this chapter"
        onClick={() => { const n = chapterForPath(model?.chapters, session?.path ?? "")?.number ?? visible; if (n) startListening(n); }}>
        <Icon name="headphones" size={16} />
      </button>
      <div className="tb-spacer" />
      {suggesting && <span className="mode-pill" title="Your edits are saved as suggestions for the author to accept or reject">Suggesting</span>}
      {saveLabel && <span className={`save-state ${readOnly ? "readonly" : state}`} aria-live="polite" title={session?.error || saveLabel}>{readOnly ? null : state === "saving" ? <span className="spinner tiny" /> : state === "error" ? "!" : <Icon name="check" size={13} />} {saveLabel}</span>}
      <div className="tb-size" role="group" aria-label="Reading comfort">
        <select
          className="tb-font-select"
          aria-label="Reading font"
          title="Reading font comfort"
          value={proseFont}
          onChange={e => setProseFont(e.target.value)}
        >
          <option value="serif">Serif</option>
          <option value="sans">Sans</option>
          <option value="dyslexic">Accessible spacing</option>
        </select>
        <button className="tb-size-btn" onMouseDown={e => e.preventDefault()} onClick={() => setSize(size - 1)} disabled={size <= 14} aria-label="Smaller text">A−</button>
        <span className="tb-size-val">{size}</span>
        <button className="tb-size-btn" onMouseDown={e => e.preventDefault()} onClick={() => setSize(size + 1)} disabled={size >= 24} aria-label="Larger text">A+</button>
      </div>
      <Btn icon="focus" label={focusMode ? "Exit focus mode" : "Focus mode"} active={focusMode} onClick={() => setFocusMode(!focusMode)} />
      <Btn icon="panel" label={panelOpen ? "Hide side panel" : "Show side panel"} active={panelOpen} onClick={togglePanel} />
    </div>
  );
}
