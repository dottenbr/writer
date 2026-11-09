import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { RichEditor } from "./RichEditor";
import { useDocSession, type DocSession } from "./useDocSession";
import { useEditorBus } from "./editorBus";
import { useAccess, useEntityMatcher } from "./common";
import { useBookStore } from "../../store/useBookStore";
import { joinDocument, markdownToHtml, splitDocument } from "../../lib/markdown-doc";
import { slugify as slug } from "../../lib/book-model";
import { parseScenes } from "../../lib/scene-cards";

interface Props {
  path: string;
  /** Whether this text may be edited at all (reference drafts may not). */
  writable: boolean;
  chapterAnchors?: boolean;
  placeholder?: string;
  initialPoint?: { x: number; y: number } | null;
  find?: string;
  anchor?: string;
  onSession?: (session: DocSession) => void;
  /** The chapter's scene-card file: its cards appear at the top of each scene. */
  scenesPath?: string;
}

/** One live document: loads, edits, autosaves and links. */
export function ActiveDoc({ path, writable, chapterAnchors, placeholder, initialPoint, find, anchor, onSession, scenesPath }: Props) {
  const { projectId, userId, canEdit, suggesting } = useAccess();
  const session = useDocSession(path, { projectId, userId, editable: writable && canEdit, suggesting });
  const matcher = useEntityMatcher();
  const review = useBookStore(s => s.reviews[path]);
  const loadReview = useBookStore(s => s.loadReview);
  const setBusEditor = useEditorBus(s => s.setEditor);
  const setBusSession = useEditorBus(s => s.setSession);
  const setSelection = useEditorBus(s => s.setSelection);
  const activeThread = useBookStore(s => s.activeThread);
  const scenesFile = useBookStore(s => (scenesPath ? s.files.find(f => f.path === scenesPath)?.content : undefined));
  const sceneCount = useMemo(() => (scenesFile ? parseScenes(scenesFile).length : 0), [scenesFile]);
  const editorRef = useRef<Editor | null>(null);
  const textRef = useRef(session.text);
  textRef.current = session.text;

  useEffect(() => { void loadReview(path).catch(() => {}); }, [path, loadReview]);
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  useEffect(() => { setBusSession(session); onSessionRef.current?.(session); }, [session, setBusSession]);
  useEffect(() => () => { setBusSession(null); setBusEditor(null); setSelection(""); }, [path, setBusSession, setBusEditor, setSelection]);

  const split = useMemo(() => splitDocument(session.text), [session.text]);
  const lossless = useMemo(() => markdownToHtml(split.body).lossless, [split.body]);

  const links = useMemo(() => ({
    entities: matcher,
    chapterAnchors,
    comments: (review?.threads ?? []).filter(t => !t.resolved_at && t.quoted_text).map(t => ({ id: t.id, quote: t.quoted_text, active: t.id === activeThread })),
    flash: find,
  }), [matcher, chapterAnchors, review, find, activeThread]);

  // Scroll to a requested heading or found text once the document is in place.
  useEffect(() => {
    if (session.state === "loading") return;
    const timer = setTimeout(() => {
      const root = editorRef.current?.view.dom as HTMLElement | undefined;
      if (!root) return;
      let target: Element | null = null;
      if (find) target = root.querySelector(".flash-mark");
      if (!target && anchor) {
        target = [...root.querySelectorAll("h1,h2,h3,h4")].find(h => slug(h.textContent ?? "") === anchor) ?? null;
      }
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [session.reloadKey, session.state, find, anchor]);

  if (session.state === "loading" && !session.text) return <div className="doc-loading"><span className="spinner" /> Opening…</div>;
  if (session.error && !session.row) return <div className="doc-error" role="alert">{session.error}</div>;

  if (!lossless && writable && canEdit) {
    return (
      <div className="markdown-mode">
        <p className="markdown-mode-note">This page uses formatting the visual editor can’t keep exactly, so it opens as plain Markdown.</p>
        <textarea className="markdown-source" value={session.text} spellCheck onChange={e => session.setText(e.target.value)} aria-label="Markdown source" />
      </div>
    );
  }

  const problem = session.error && session.row ? (
    <div className="save-problem" role="alert">
      <span>{session.conflict ? "Someone else changed the same passage. Your text is kept in this browser." : `Not saved: ${session.error}`}</span>
      {session.conflict ? (
        <>
          <button className="btn btn-sm" onClick={session.keepMine}>Keep my version</button>
          <button className="btn btn-sm" onClick={() => { if (confirm("Discard your unsaved changes and load the latest saved text?")) session.useLatest(); }}>Load theirs</button>
        </>
      ) : <button className="btn btn-sm" onClick={() => void session.saveNow()}>Retry</button>}
    </div>
  ) : session.notice ? <div className="save-notice" role="status">{session.notice}</div> : null;

  return (
    <>
    {problem}
    <RichEditor
      body={split.body}
      reloadKey={`${path}:${session.reloadKey}`}
      editable={writable && canEdit && session.state !== "loading"}
      placeholder={placeholder ?? (suggesting ? "Suggest text…" : "Start writing…")}
      links={links}
      scenes={scenesPath && sceneCount ? { path: scenesPath, count: sceneCount } : undefined}
      initialPoint={initialPoint}
      onReady={editor => { editorRef.current = editor; setBusEditor(editor); }}
      onSelection={setSelection}
      onChange={body => {
        const current = splitDocument(textRef.current);
        session.setText(joinDocument(current, body));
      }}
    />
    </>
  );
}

