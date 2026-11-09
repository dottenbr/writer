import { useEffect, useMemo, useRef, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useListenStore } from "../../store/useListenStore";
import { parseScenes } from "../../lib/scene-cards";
import { discardBookDocument, getInspirationUrl, saveBookDocument } from "../../lib/supabase-service";
import { dailyInspirationIndex, isImageFile, nextShuffleIndex } from "../../lib/cover-art";
import { updateConfig } from "../../lib/book-config";
import { startChapterContent, type ChapterInfo } from "../../lib/book-model";
import { countWords, markdownToPlain, setFrontMatterField, splitDocument } from "../../lib/markdown-doc";
import { ActiveDoc } from "./ActiveDoc";
import { StaticProse } from "./RichEditor";
import { useEditorBus } from "./editorBus";
import { chapterForPath, chapterState, formatWords, Icon, STATUS_LABEL, useAccess, useEntityMatcher } from "./common";
import type { DocSession } from "./useDocSession";

function TitlePage() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const setView = useBookStore(s => s.setView);
  const wordsToday = useBookStore(s => s.wordsToday);
  const projectId = useProjectStore(s => s.currentProjectId) ?? "";
  const inspirationItems = useProjectStore(s => s.inspirationItems);
  const imageItems = useMemo(
    () => inspirationItems.filter(i => isImageFile(i.fileName)),
    [inspirationItems]
  );
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dailyIdx = useMemo(
    () => dailyInspirationIndex(todayIso, projectId, imageItems.length),
    [todayIso, projectId, imageItems.length]
  );
  const [bgIndex, setBgIndex] = useState(dailyIdx);
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    setBgIndex(dailyIdx);
  }, [dailyIdx]);

  const activeItem = imageItems[bgIndex] ?? imageItems[0] ?? null;

  useEffect(() => {
    if (!projectId || !activeItem) {
      setBgUrl(null);
      return;
    }
    let live = true;
    getInspirationUrl(projectId, activeItem.fileName)
      .then(url => {
        if (live && url) setBgUrl(url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId, activeItem]);

  const synopsis = useMemo(() => {
    const doc = files.find(f => f.path === "bible/book-on-one-page.md");
    if (!doc) return "";
    return splitDocument(doc.content).body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#")) ?? "";
  }, [files]);
  const written = model.chapters.filter(c => c.authorPath && !c.started);
  const inProgress = model.chapters.filter(c => c.started);
  const next = inProgress[0] ?? model.chapters.find(c => !c.authorPath) ?? model.chapters[0];
  const authorWords = model.chapters.reduce((n, c) => n + c.authorWords, 0);
  const draftWords = model.chapters.reduce((n, c) => n + c.referenceWords, 0);
  return (
    <header className={`title-page ${bgUrl ? "has-bg" : ""}`}>
      {bgUrl && (
        <div
          className="title-page-bg"
          style={{ backgroundImage: `url("${bgUrl}")` }}
          aria-hidden
        />
      )}
      <div className="title-page-content">
        <div className="title-page-eyebrow">{model.formEyebrow}</div>
        <h1 className="title-page-title">{model.title}</h1>
        {model.author && <div className="title-page-author">{model.author}</div>}
        {synopsis && <p className="title-page-synopsis">{synopsis.replace(/[*_]/g, "")}</p>}
        <div className="title-page-stats">
          <div><strong>{model.chapters.length}</strong><span>chapters</span></div>
          <div><strong>{written.length}</strong><span>written by you</span></div>
          <div><strong>{formatWords(authorWords)}</strong><span>{model.targetWords ? `of ${formatWords(model.targetWords)} goal` : "your words"}</span></div>
          {model.hasDraft && <div><strong>{formatWords(draftWords)}</strong><span>reference draft</span></div>}
          {wordsToday > 0 && <div><strong className="today">+{formatWords(wordsToday)}</strong><span>today</span></div>}
        </div>
        {next && (
          <button className="btn btn-primary title-page-cta" onClick={() => go(next.authorPath ?? next.currentPath)}>
            <Icon name="pen" size={15} /> {next.started ? "Continue" : next.authorPath ? "Open" : "Begin"} chapter {next.number}{next.title ? ` · ${next.title}` : ""}
          </button>
        )}
        {activeItem && (
          <div className="title-page-mood">
            <button
              type="button"
              className="link-btn title-page-mood-caption"
              onClick={() => setView("inspiration")}
              title="Open the inspiration mood board"
            >
              {activeItem.label}
            </button>
            {imageItems.length > 1 && (
              <button
                type="button"
                className="btn btn-sm title-page-shuffle"
                onClick={() => setBgIndex(i => nextShuffleIndex(i, imageItems.length))}
                title="Shuffle background from the inspiration mood board"
                aria-label="Shuffle background image"
              >
                <Icon name="sparkle" size={13} /> Shuffle
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function ChapterHeader({ chapter, session, active }: { chapter: ChapterInfo; session: DocSession | null; active: boolean }) {
  const { isOwner, canEdit, projectId } = useAccess();
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const st = chapterState(chapter);
  const showingAuthor = !!chapter.authorPath;
  const editableMeta = active && showingAuthor && canEdit && session?.row;
  const meta = session && active ? splitDocument(session.text).metadata : null;
  const title = String(meta?.title ?? chapter.title ?? "");
  const status = String(meta?.status ?? chapter.status);
  const explicitGoal = Number(meta?.draft_budget_words ?? meta?.target_words ?? chapter.budgetWords ?? 0);
  const currentGoal = Number.isInteger(explicitGoal) && explicitGoal > 0 ? explicitGoal : null;
  const shownGoal = currentGoal ?? chapter.targetWords;
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftGoal, setDraftGoal] = useState(currentGoal ? String(currentGoal) : "");
  useEffect(() => setDraftTitle(title), [title]);
  useEffect(() => setDraftGoal(currentGoal ? String(currentGoal) : ""), [currentGoal, chapter.number]);

  const commitGoal = async (raw: string) => {
    if (!session) return;
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Math.max(50, Math.round(Number(trimmed) || 0));
    if (parsed === currentGoal) return;
    session.setText(setFrontMatterField(session.text, "draft_budget_words", parsed));
    if (parsed != null && projectId) {
      const yamlFile = files.find(f => f.path === "book.yaml");
      if (yamlFile) {
        const nextYaml = updateConfig(yamlFile.content, { allowChapterBudget: true });
        if (nextYaml !== yamlFile.content) {
          try {
            const saved = await saveBookDocument(projectId, "book.yaml", nextYaml, yamlFile.version);
            upsert({ ...saved, loaded: true });
          } catch { /* non-fatal */ }
        }
      }
    }
  };

  return (
    <div className="chapter-head">
      <div className="chapter-eyebrow">
        <span>Chapter {chapter.number}</span>
        <span className={`chapter-state ${st.key}`}>{st.label}</span>
        {showingAuthor && <span className="chapter-words">{formatWords(chapter.authorWords)}{shownGoal > 0 ? ` of ${formatWords(shownGoal)}` : ""} words</span>}
        <button className="chapter-listen" onClick={() => useListenStore.getState().start(chapter.number)} title="Listen to this chapter"><Icon name="headphones" size={13} /> Listen</button>
        {!showingAuthor && chapter.referenceWords > 0 && <span className="chapter-words">{formatWords(chapter.referenceWords)} words in draft{chapter.budgetWords ? ` · ${formatWords(chapter.budgetWords)} goal` : ""}</span>}
      </div>
      {editableMeta ? (
        <input
          className="chapter-title-input"
          value={draftTitle}
          aria-label="Chapter title"
          placeholder="Untitled chapter"
          onChange={e => setDraftTitle(e.target.value)}
          onBlur={() => { if (draftTitle.trim() && draftTitle !== title) session!.setText(setFrontMatterField(session!.text, "title", draftTitle.trim())); }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      ) : (
        <h2 className="chapter-title">{title || `Chapter ${chapter.number}`}</h2>
      )}
      {chapter.subtitle && <div className="chapter-subtitle">{chapter.subtitle}</div>}
      {editableMeta && isOwner && (
        <div className="chapter-status-row">
          <label>
            Status
            <select value={status} onChange={e => session!.setText(setFrontMatterField(session!.text, "status", e.target.value))}>
              {chapter.referencePath && <option value="drafting">In progress — the draft stays the reference</option>}
              {[...new Set(["drafted", "revised", "final", status])].filter(s => s !== "drafting" || !chapter.referencePath).map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
          </label>
          <label>
            Word goal
            <input
              type="number"
              min={50}
              step={100}
              className="chapter-goal-input"
              value={draftGoal}
              placeholder={String(chapter.targetWords || 3000)}
              aria-label="Chapter word goal"
              onChange={e => setDraftGoal(e.target.value)}
              onBlur={() => void commitGoal(draftGoal)}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * Undo "Write this chapter": while your started chapter is still empty, you
 * can go back to reading the reference draft. Once you've written a word,
 * the option goes away.
 */
function StartedNotice({ chapter, session }: { chapter: ChapterInfo; session: DocSession | null }) {
  const { isOwner, projectId } = useAccess();
  const file = useBookStore(s => s.files.find(f => f.path === chapter.authorPath));
  const drop = useBookStore(s => s.drop);
  const go = useBookStore(s => s.go);
  const threads = useBookStore(s => (chapter.authorPath ? (s.openThreads[chapter.authorPath] ?? 0) + (s.pendingSuggestions[chapter.authorPath] ?? 0) : 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!isOwner || !projectId || !chapter.authorPath || !chapter.referencePath || !file?.loaded || threads) return null;
  const text = session?.text ?? file.content;
  if (countWords(markdownToPlain(splitDocument(text).body.replace(/^#{1,6}\s.*$/gm, ""))) > 0) return null;
  if (session && (!["idle", "saved"].includes(session.state) || session.text !== file.content)) return null;
  async function discard() {
    setBusy(true); setError("");
    try {
      await discardBookDocument(projectId!, chapter.authorPath!, file!.version);
      drop(chapter.authorPath!);
      go(chapter.referencePath!);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <div className="started-notice">
      <span>Nothing written yet.</span>
      <button className="link-btn" disabled={busy} onClick={() => void discard()}>{busy ? "Going back…" : "Go back to the reference draft"}</button>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

function ReferenceNotice({ chapter }: { chapter: ChapterInfo }) {
  const { isOwner, projectId } = useAccess();
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const go = useBookStore(s => s.go);
  const setPanel = useBookStore(s => s.setPanel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (!projectId || !chapter.referencePath) return;
    setBusy(true); setError("");
    try {
      const reference = files.find(f => f.path === chapter.referencePath)!;
      const target = model.manuscriptDir + "/" + chapter.referencePath.slice(model.draftDir!.length + 1);
      const scenesFile = chapter.scenesPath ? files.find(f => f.path === chapter.scenesPath)?.content : undefined;
      const headings = scenesFile ? parseScenes(scenesFile).map(c => c.heading) : [];
      const row = await saveBookDocument(projectId, target, startChapterContent(reference.content, model.config, headings), null);
      upsert({ ...row, loaded: true });
      go(target);
      setPanel("draft");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="reference-notice">
      <div>
        <strong>Reference draft.</strong> This is the draft you’re writing from, not your text. It stays read-only.
      </div>
      {isOwner && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void start()}><Icon name="pen" size={14} /> {busy ? "Starting…" : "Write this chapter"}</button>}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

export function ManuscriptView() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const location = useBookStore(s => s.location);
  const visibleChapter = useBookStore(s => s.visibleChapter);
  const setVisibleChapter = useBookStore(s => s.setVisibleChapter);
  const listeningChapter = useListenStore(s => s.chapter);
  const { canEdit } = useAccess();
  const matcher = useEntityMatcher();
  const [active, setActive] = useState<{ number: number; point: { x: number; y: number } | null } | null>(null);
  const [session, setSession] = useState<DocSession | null>(null);
  const [nearChapters, setNearChapters] = useState<Set<number>>(() => {
    const initial = chapterForPath(model.chapters, location.path)?.number ?? model.chapters[0]?.number ?? 1;
    return new Set([initial - 1, initial, initial + 1, initial + 2]);
  });
  const refs = useRef(new Map<number, HTMLElement>());
  const proseHeights = useRef(new Map<number, number>());
  const scroller = useRef<HTMLDivElement>(null);
  const setBusSession = useEditorBus(s => s.setSession);

  // Navigate to the requested chapter.
  useEffect(() => {
    const chapter = chapterForPath(model.chapters, location.path);
    if (!chapter) {
      if (location.path === "") scroller.current?.closest(".main-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setNearChapters(prev => {
      const next = new Set(prev);
      next.add(chapter.number - 1);
      next.add(chapter.number);
      next.add(chapter.number + 1);
      return next;
    });
    setActive({ number: chapter.number, point: null });
    const scroll = (behavior: ScrollBehavior) => refs.current.get(chapter.number)?.scrollIntoView({ behavior, block: "start" });
    requestAnimationFrame(() => scroll("instant" as ScrollBehavior));
    const settle = setTimeout(() => { if (!location.find) scroll("instant" as ScrollBehavior); }, 260);
    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.nonce]);

  // Track which chapter is on screen and pre-hydrate chapters near the viewport.
  useEffect(() => {
    const root = scroller.current?.closest(".main-scroll");
    if (!root) return;
    const seen = new Map<number, number>();
    const nearSet = new Set<number>();
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(Number((e.target as HTMLElement).dataset.chapter), e.isIntersecting ? e.boundingClientRect.top : Infinity);
      const visible = [...seen.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1]);
      const top = visible.find(([, t]) => t > -window.innerHeight * 0.6) ?? visible[0];
      setVisibleChapter(top?.[0]);
    }, { root, rootMargin: "-10% 0px -60% 0px" });
    const hydrateObserver = new IntersectionObserver(entries => {
      let changed = false;
      for (const e of entries) {
        const num = Number((e.target as HTMLElement).dataset.chapter);
        if (e.isIntersecting) {
          if (!nearSet.has(num)) { nearSet.add(num); changed = true; }
        } else {
          const proseEl = (e.target as HTMLElement).querySelector(".doc-prose.static") as HTMLElement | null;
          if (proseEl && proseEl.offsetHeight > 0) proseHeights.current.set(num, proseEl.offsetHeight);
          if (nearSet.delete(num)) changed = true;
        }
      }
      if (changed) setNearChapters(new Set(nearSet));
    }, { root, rootMargin: "1200px 0px 1200px 0px" });
    refs.current.forEach(el => {
      observer.observe(el);
      hydrateObserver.observe(el);
    });
    return () => {
      observer.disconnect();
      hydrateObserver.disconnect();
    };
  }, [model.chapters.length, setVisibleChapter]);

  useEffect(() => () => setBusSession(null), [setBusSession]);

  const content = (path?: string) => (path ? files.find(f => f.path === path)?.content ?? "" : "");
  const anchorCenter = visibleChapter ?? chapterForPath(model.chapters, location.path)?.number ?? model.chapters[0]?.number ?? 1;

  let lastPart = "";
  return (
    <div className="manuscript" ref={scroller}>
      <div className="page">
        <TitlePage />
      </div>
      {model.chapters.map(c => {
        const path = c.authorPath ?? c.referencePath!;
        const isActive = active?.number === c.number;
        const showReference = !c.authorPath;
        const isHydrated = isActive || listeningChapter === c.number || nearChapters.has(c.number) || Math.abs(c.number - anchorCenter) <= 1;
        const partHeader = c.part && c.part.key !== lastPart ? c.part : null;
        if (c.part) lastPart = c.part.key;
        const estimatedHeight = proseHeights.current.get(c.number) ?? Math.max(240, Math.round((c.authorWords || c.referenceWords || 600) * 0.42));
        return (
          <div key={c.number}>
            {partHeader && <div className="part-divider"><span>{partHeader.title}</span></div>}
            <section
              className={`page chapter ${isActive ? "active" : ""} ${showReference ? "is-reference" : ""}`}
              data-chapter={c.number}
              ref={el => { if (el) refs.current.set(c.number, el); else refs.current.delete(c.number); }}
            >
              <ChapterHeader chapter={c} session={isActive && session?.path === path ? session : null} active={isActive} />
              {showReference && <ReferenceNotice chapter={c} />}
              {!showReference && <StartedNotice chapter={c} session={isActive && session?.path === path ? session : null} />}
              {isActive ? (
                <ActiveDoc
                  key={path}
                  path={path}
                  writable={!showReference}
                  initialPoint={active!.point}
                  find={location.find && chapterForPath(model.chapters, location.path)?.number === c.number ? location.find : undefined}
                  placeholder={c.started && c.referencePath ? "Your chapter starts here. The reference draft is open in the side panel." : "Start writing…"}
                  onSession={setSession}
                  scenesPath={c.scenesPath}
                />
              ) : isHydrated ? (
                <StaticProse
                  matcher={matcher}
                  body={splitDocument(content(path)).body}
                  className={showReference ? "reference" : ""}
                  scenesPath={c.scenesPath}
                  onActivate={point => setActive({ number: c.number, point: canEdit && !showReference ? point : null })}
                />
              ) : (
                <div
                  className={`doc-prose static chapter-deferred ${showReference ? "reference" : ""}`}
                  style={{ minHeight: `${estimatedHeight}px` }}
                  onMouseUp={e => {
                    if (window.getSelection()?.toString()) return;
                    setActive({ number: c.number, point: canEdit && !showReference ? { x: e.clientX, y: e.clientY } : null });
                  }}
                />
              )}
              {!isActive && c.authorPath && !splitDocument(content(path)).body.trim() && (
                <button className="empty-chapter" onClick={() => setActive({ number: c.number, point: null })}>Click to start writing</button>
              )}
            </section>
          </div>
        );
      })}
      {model.chapters.length === 0 && (
        <div className="page empty-book">
          <h2>No chapters yet</h2>
          <p>Create the first chapter from the contents panel.</p>
        </div>
      )}
    </div>
  );
}
