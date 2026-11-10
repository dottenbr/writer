import { useMemo, useRef, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { useDocSession } from "./useDocSession";
import { RichEditor } from "./RichEditor";
import { SceneCards } from "./SceneBoard";
import { chapterState, formatWords, Icon, useAccess, useEntityMatcher } from "./common";
import { scenesPathFor, type ChapterInfo } from "../../lib/book-model";
import { markdownToHtml } from "../../lib/markdown-doc";
import { addScene, newScenesFile } from "../../lib/scene-cards";
import { addChapterPlan, chapterPlanBody, newOutlineFile, OUTLINE_PATH, replaceChapterPlan } from "../../lib/chapter-outline";
import { saveBookDocument } from "../../lib/supabase-service";

/** The chapter's section of the chapter outline, edited in place. */
function ChapterPlanEditor({ chapter }: { chapter: ChapterInfo }) {
  const { projectId, userId, canEdit, suggesting } = useAccess();
  const hasOutline = useBookStore(s => s.files.some(f => f.path === OUTLINE_PATH));
  const upsert = useBookStore(s => s.upsert);
  const session = useDocSession(hasOutline ? OUTLINE_PATH : null, { projectId, userId, editable: canEdit, suggesting });
  const textRef = useRef(session.text);
  textRef.current = session.text;
  const matcher = useEntityMatcher();
  const links = useMemo(() => ({ entities: matcher, chapterAnchors: true }), [matcher]);
  const body = useMemo(() => chapterPlanBody(session.text, chapter.number), [session.text, chapter.number]);
  const lossless = useMemo(() => (body == null ? true : markdownToHtml(body).lossless), [body]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startOutline() {
    if (!projectId) return;
    setBusy(true); setError("");
    try {
      const row = await saveBookDocument(projectId, OUTLINE_PATH, newOutlineFile(chapter.number, chapter.title), null);
      upsert({ ...row, loaded: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (hasOutline && session.state === "loading" && !session.text) return <div className="doc-loading"><span className="spinner" /> Opening…</div>;
  if (body == null) {
    return (
      <div className="chapter-plan-empty">
        <p>No plan for this chapter yet. Write down what it is for, what changes and how it ends.</p>
        {canEdit && (
          <button className="btn btn-sm btn-primary" disabled={busy || (hasOutline && session.state === "loading")}
            onClick={() => (hasOutline ? session.setText(addChapterPlan(textRef.current, chapter.number, chapter.title)) : void startOutline())}>
            <Icon name="plus" size={13} /> {busy ? "Adding…" : "Add a chapter plan"}
          </button>
        )}
        {error && <div className="inline-error" role="alert">{error}</div>}
      </div>
    );
  }
  return (
    <div className="chapter-plan-body">
      {session.error && <div className="save-problem" role="alert"><span>Not saved: {session.error}</span><button className="btn btn-sm" onClick={() => void session.saveNow()}>Retry</button></div>}
      {lossless || !canEdit ? (
        <RichEditor
          body={body}
          reloadKey={`${OUTLINE_PATH}#${chapter.number}:${session.reloadKey}`}
          editable={canEdit && session.state !== "loading"}
          placeholder="Purpose, what changes, how the chapter ends…"
          links={links}
          className="chapter-plan-editor"
          onChange={next => session.setText(replaceChapterPlan(textRef.current, chapter.number, next))}
        />
      ) : (
        <textarea className="markdown-source" value={body} spellCheck aria-label="Chapter plan"
          onChange={e => session.setText(replaceChapterPlan(textRef.current, chapter.number, e.target.value))} />
      )}
      <div className="chapter-plan-save muted">{session.state === "saving" ? "Saving…" : session.state === "dirty" ? "Unsaved changes" : session.state === "saved" ? "Saved" : ""}</div>
    </div>
  );
}

/** Plan › one chapter: its plan from the outline and its scene cards, both editable. */
export function ChapterPlanPage({ path, anchor }: { path: string; anchor?: string }) {
  const model = useBookStore(s => s.model)!;
  const hasScenes = useBookStore(s => s.files.some(f => f.path === path));
  const go = useBookStore(s => s.go);
  const upsert = useBookStore(s => s.upsert);
  const { projectId, canEdit } = useAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const number = Number(path.match(/(\d+)[^/]*\.md$/)?.[1]);
  const chapter = model.chapters.find(c => c.scenesPath === path) ?? model.chapters.find(c => c.number === number);
  const index = chapter ? model.chapters.indexOf(chapter) : -1;
  const prev = index > 0 ? model.chapters[index - 1] : undefined;
  const next = index >= 0 && index < model.chapters.length - 1 ? model.chapters[index + 1] : undefined;

  async function startScenes() {
    if (!projectId || !chapter) return;
    setBusy(true); setError("");
    try {
      const row = await saveBookDocument(projectId, path, addScene(newScenesFile(chapter.number, chapter.title), "New scene").text, null);
      upsert({ ...row, loaded: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!chapter) {
    return <div className="board"><div className="empty-board"><p>This chapter isn’t in the book any more.</p><button className="btn" onClick={() => go("", { view: "plan" })}>Back to the plan</button></div></div>;
  }
  const st = chapterState(chapter);
  const words = chapter.authorPath ? `${formatWords(chapter.authorWords)} of ${formatWords(chapter.targetWords)} words` : chapter.referenceWords ? `${formatWords(chapter.referenceWords)} words in the reference draft` : `Goal ${formatWords(chapter.targetWords)} words`;
  return (
    <div className="board chapter-plan-page">
      <nav className="entity-crumbs" aria-label="Chapters">
        <button className="link-btn" onClick={() => go("", { view: "plan" })}><Icon name="back" size={13} /> All chapters</button>
        <span className="entity-pager">
          <button className="icon-btn" disabled={!prev} onClick={() => prev && go(scenesPathFor(prev), { view: "plan" })} title={prev?.label} aria-label="Previous chapter"><Icon name="back" size={14} /></button>
          <span>Chapter {chapter.number} of {model.chapters.length}</span>
          <button className="icon-btn" disabled={!next} onClick={() => next && go(scenesPathFor(next), { view: "plan" })} title={next?.label} aria-label="Next chapter"><Icon name="chevron" size={14} /></button>
        </span>
      </nav>
      <header className="chapter-plan-head">
        <div>
          <div className="doc-eyebrow">
            <span>{chapter.part ? `${chapter.part.title} · ` : ""}Chapter {chapter.number}</span>
            <span className={`chapter-state ${st.key}`}>{st.label}</span>
          </div>
          <h1>{chapter.title || `Chapter ${chapter.number}`}</h1>
          <p className="board-sub">{words}</p>
        </div>
        <button className="btn btn-sm" onClick={() => go(chapter.authorPath ?? chapter.currentPath)}><Icon name="pen" size={13} /> Open in manuscript</button>
      </header>

      <section className="chapter-plan-section">
        <h2 className="chapter-plan-label">Chapter plan</h2>
        <ChapterPlanEditor chapter={chapter} />
      </section>

      <section className="chapter-plan-section">
        <h2 className="chapter-plan-label">Scene cards{chapter.sceneTitles.length ? <span>{chapter.sceneTitles.length}</span> : null}</h2>
        {hasScenes ? <SceneCards key={path} path={path} chapter={chapter} anchor={anchor} /> : (
          <div className="chapter-plan-empty">
            <p>Break the chapter into scenes: who is in each, what happens, and the turn it ends on.</p>
            {canEdit && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void startScenes()}><Icon name="plus" size={13} /> {busy ? "Creating…" : "Add the first scene"}</button>}
            {error && <div className="inline-error" role="alert">{error}</div>}
          </div>
        )}
      </section>
    </div>
  );
}
