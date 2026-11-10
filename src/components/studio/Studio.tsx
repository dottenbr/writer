import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChipPopover } from "./ChipPopover";
import { useSources } from "./useSources";
import { parseAnchor } from "../../lib/anchors";
import { useProjectStore } from "../../store/useProjectStore";
import { useAuthStore } from "../../store/useAuthStore";
import { prefs, useBookStore, writePrefs, type View } from "../../store/useBookStore";
import { useEditorBus } from "./editorBus";
import { Navigator, navScopeFor } from "./Navigator";
import { Toolbar } from "./Toolbar";
import { ListenBar } from "./ListenBar";
import { bookIdForSlug, bookSlug, FULL_PAGE, navFlags, openInNewTab, resolveInternalHref, routeToUrl, studioDocumentTitle, urlBookSlug, urlToRoute } from "../../lib/book-url";
import { useHomeStore } from "../../store/useHomeStore";
import { canWriteIn, useLibraryStore } from "../../store/useLibraryStore";
import { hostLibrary, libraryUrl } from "../../lib/library-host";
import { ErrorBoundary } from "./ErrorBoundary";
import { chapterForPath, chapterState, Icon, initials, KIND_LABEL, useAccess } from "./common";
import { anchorNumbers, entityKindForPath, nextChapterPath } from "../../lib/book-model";
import { BOOK_FORMS, formMeta, type BookForm } from "../../lib/book-config";
import { saveBookDocument, createBook, setAccountPassword, placeBook, readBookPlacement } from "../../lib/supabase-service";
import { navigatePublic } from "../../lib/public-routes";
import { Collaboration } from "../Collaboration";

/**
 * Lazy views. After a new release the old chunk files are gone, so a tab that
 * was open across a deploy reloads once to pick up the new ones.
 */
function lazyView<T>(load: () => Promise<T>) {
  return lazy(() => load().catch(error => {
    if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message ?? error))) {
      try {
        const last = Number(sessionStorage.getItem("bookkit-chunk-reload") ?? 0);
        if (Date.now() - last > 30000) { sessionStorage.setItem("bookkit-chunk-reload", String(Date.now())); window.location.reload(); return new Promise<never>(() => {}); }
      } catch { /* storage unavailable */ }
    }
    throw error;
  }) as Promise<any>);
}
/** Every view's code, fetched once the book is open so switching sections never waits. */
const VIEW_CHUNKS = [() => import("./ManuscriptView"), () => import("./CompanionView"), () => import("./ContextPanel"), () => import("./Boards"), () => import("./BiblePages"), () => import("./ChapterPlanPage"), () => import("./TimelinePage"), () => import("./BookSettings"), () => import("../Inspiration"), () => import("./BriefPage"), () => import("./SourcesPage")];
let viewsPreloaded = false;
function preloadViews() {
  if (viewsPreloaded) return;
  viewsPreloaded = true;
  const run = () => VIEW_CHUNKS.forEach(load => void load().catch(() => { /* loaded on demand instead */ }));
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 800);
}
const ManuscriptView = lazyView(() => import("./ManuscriptView").then(m => ({ default: m.ManuscriptView })));
const CompanionView = lazyView(() => import("./CompanionView").then(m => ({ default: m.CompanionView })));
const ContextPanel = lazyView(() => import("./ContextPanel").then(m => ({ default: m.ContextPanel })));
const BibleBoard = lazyView(() => import("./Boards").then(m => ({ default: m.BibleBoard })));
const PlanBoard = lazyView(() => import("./Boards").then(m => ({ default: m.PlanBoard })));
const EntityIndex = lazyView(() => import("./BiblePages").then(m => ({ default: m.EntityIndex })));
const EntityPage = lazyView(() => import("./BiblePages").then(m => ({ default: m.EntityPage })));
const ChapterPlanPage = lazyView(() => import("./ChapterPlanPage").then(m => ({ default: m.ChapterPlanPage })));
const TimelinePage = lazyView(() => import("./TimelinePage").then(m => ({ default: m.TimelinePage })));
const BookSettings = lazyView(() => import("./BookSettings").then(m => ({ default: m.BookSettings })));
const Inspiration = lazyView(() => import("../Inspiration").then(m => ({ default: m.Inspiration })));
const SourcesPage = lazyView(() => import("./SourcesPage").then(m => ({ default: m.SourcesPage })));
const BriefPage = lazyView(() => import("./BriefPage").then(m => ({ default: m.BriefPage })));

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => prefs().theme ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePrefs({ theme });
  }, [theme]);
  return [theme, setTheme] as const;
}

function BookSwitcher() {
  const catalog = useProjectStore(s => s.projectCatalog);
  const currentId = useProjectStore(s => s.currentProjectId);
  const switchProject = useProjectStore(s => s.switchProject);
  const title = useBookStore(s => s.model?.title);
  const here = useLibraryStore(s => s.current());
  const others = (useLibraryStore(s => s.libraries) ?? []).filter(l => l.id !== here?.id);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = catalog.find(p => p.id === currentId);
  return (
    <div className="book-switcher" ref={ref}>
      <button className="book-switcher-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="book-switcher-name">{title ?? current?.name ?? "Choose a book"}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="menu book-menu">
          <button className="menu-item" onClick={() => { setOpen(false); useHomeStore.getState().showHome(); }}><Icon name="grid" size={15} /> <span className="menu-item-text">{here ? `${here.name} home` : "All books"}</span></button>
          <div className="menu-sep" />
          <div className="menu-label">{here ? "Books in this library" : "Your books"}</div>
          {catalog.filter(p => !here || p.libraryId === here.id).map(p => (
            <button key={p.id} className={`menu-item ${p.id === currentId ? "current" : ""}`} onClick={() => {
              setOpen(false);
              if (navFlags.openInNewTab) {
                navFlags.openInNewTab = false;
                openInNewTab("/" + bookSlug(catalog, p.id));
                return;
              }
              if (p.id !== currentId) void switchProject(p.id);
            }}>
              <Icon name="book" size={15} />
              <span className="menu-item-text">{p.name}</span>
              {p.role !== "owner" && <span className="menu-meta">{p.role}</span>}
              {p.id === currentId && <Icon name="check" size={14} />}
            </button>
          ))}
          {others.length > 0 && <>
            <div className="menu-sep" />
            <div className="menu-label">Other libraries</div>
            {others.map(l => <a key={l.id} className="menu-item" href={libraryUrl(l.slug)}><Icon name="book" size={15} /><span className="menu-item-text">{l.name}</span></a>)}
          </>}
          <div className="menu-sep" />
          <button data-no-tab className="menu-item" onClick={() => { setOpen(false); setCreating(true); }}><Icon name="plus" size={15} /> New book</button>
        </div>
      )}
      {creating && <NewBookDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewBookDialog({ onClose }: { onClose: () => void }) {
  const switchProject = useProjectStore(s => s.switchProject);
  const refreshCatalog = useProjectStore(s => s.loadFromStorage);
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const here = useLibraryStore(s => s.current());
  const writable = libraries.filter(canWriteIn);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState(() => prefs().authorName ?? "");
  const [form, setForm] = useState<BookForm>("novel");
  const [libraryId, setLibraryId] = useState<string>(() => (here && canWriteIn(here) ? here.id : writable[0]?.id ?? ""));
  const library = libraries.find(l => l.id === libraryId);
  const [shelfId, setShelfId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shelves = [...(library?.shelves ?? [])].sort((a, b) => a.position - b.position);
  const fm = formMeta(form);
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog" onSubmit={async e => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true); setError("");
        try {
          writePrefs({ authorName: author.trim() });
          const id = await createBook(title.trim(), author.trim(), { libraryId: library?.id ?? null, shelfId: shelfId || null, form });
          await refreshCatalog();
          const path = "/" + bookSlug(useProjectStore.getState().projectCatalog, id);
          const activeHost = hostLibrary();
          if (activeHost && (library?.slug ?? null) !== activeHost) { window.location.href = libraryUrl(library?.slug ?? null, path); return; }
          if (!activeHost && library?.slug) useLibraryStore.getState().selectLibrary(library.slug);
          window.history.pushState(null, "", path);
          useHomeStore.getState().setHome(false);
          await switchProject(id);
          onClose();
        } catch (err) { setError((err as Error).message); setBusy(false); }
      }}>
        <h2>Start a new book</h2>
        <p className="dialog-sub">You’ll get a manuscript with a first chapter, a story bible, a plan and a style guide, all linked together.</p>
        <label className="field">Title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="The working title" /></label>
        <label className="field">Author name<input value={author} onChange={e => setAuthor(e.target.value)} placeholder="As it should appear on the cover" /></label>
        <label className="field">Form / Type
          <select value={form} onChange={e => setForm(e.target.value as BookForm)}>
            <optgroup label="Fiction">
              {BOOK_FORMS.filter(f => f.kind === "fiction").map(f => (
                <option key={f.value} value={f.value}>{f.label} ({f.defaultTargetWords.toLocaleString("en-US")} words)</option>
              ))}
            </optgroup>
            <optgroup label="Nonfiction">
              {BOOK_FORMS.filter(f => f.kind === "nonfiction").map(f => (
                <option key={f.value} value={f.value}>{f.label} ({f.defaultTargetWords.toLocaleString("en-US")} words)</option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="field-hint">Goal: {fm.defaultTargetWords.toLocaleString("en-US")} words for the book (~{fm.defaultChapterWords.toLocaleString("en-US")} per chapter). You can adjust this anytime in Brief or Configuration.</div>
        {writable.length > 1 && (
          <label className="field">Library<select value={libraryId} onChange={e => { setLibraryId(e.target.value); setShelfId(""); }}>{writable.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        )}
        {shelves.length > 0 && (
          <label className="field">Shelf<select value={shelfId} onChange={e => setShelfId(e.target.value)}><option value="">No shelf</option>{shelves.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        )}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create book"}</button>
        </div>
      </form>
    </div>
  );
}

function NewChapterDialog({ onClose }: { onClose: () => void }) {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const go = useBookStore(s => s.go);
  const { projectId } = useAccess();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    if (!projectId || !title.trim()) return;
    setBusy(true); setError("");
    try {
      const last = model.chapters[model.chapters.length - 1];
      let { path, number } = nextChapterPath(model, title);
      const lastPath = last?.authorPath ?? last?.referencePath;
      if (model.config?.manuscript?.layout === "parts" && lastPath) {
        const dir = lastPath.split("/").slice(-2, -1)[0];
        path = `${model.manuscriptDir}/${dir}/${path.split("/").pop()}`;
      }
      const lastMeta = lastPath ? (files.find(f => f.path === lastPath)?.content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "") : "";
      const carry = lastMeta.split("\n").filter(l => /^(part|part_title|kind):/.test(l));
      const status = model.hasDraft ? "drafting" : "drafting";
      const content = `---\nchapter: ${number}\ntitle: ${JSON.stringify(title.trim())}\n${carry.map(l => l + "\n").join("")}status: ${status}\n---\n\n# Chapter ${number}\n\n`;
      const row = await saveBookDocument(projectId, path, content, null);
      upsert({ ...row, loaded: true });
      const yaml = files.find(f => f.path === "book.yaml");
      if (yaml && /^\s+chapters:\s*\d+\s*$/m.test(yaml.content)) {
        try { upsert({ ...(await saveBookDocument(projectId, "book.yaml", yaml.content.replace(/^(\s+chapters:\s*)\d+/m, `$1${number}`), yaml.version)), loaded: true }); } catch { /* count stays for bin/check to report */ }
      }
      setTimeout(() => go(path), 450);
      onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog" onSubmit={e => { e.preventDefault(); void create(); }}>
        <h2>New chapter</h2>
        <p className="dialog-sub">Chapter {(model.chapters[model.chapters.length - 1]?.number ?? 0) + 1} will be added at the end of the book.</p>
        <label className="field">Title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Chapter title" /></label>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? "Adding…" : "Add chapter"}</button>
        </div>
      </form>
    </div>
  );
}

interface PaletteItem { id: string; label: string; hint: string; icon: string; run: () => void }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const model = useBookStore(s => s.model)!;
  const go = useBookStore(s => s.go);
  const setView = useBookStore(s => s.setView);
  const selectEntity = useBookStore(s => s.selectEntity);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const items = useMemo<PaletteItem[]>(() => [
    { id: "v:write", label: "Manuscript", hint: "View", icon: "pen", run: () => go("") },
    { id: "v:plan", label: "Plan board", hint: "View", icon: "grid", run: () => setView("plan") },
    { id: "v:bible", label: "Story bible", hint: "View", icon: "person", run: () => setView("bible") },
    { id: "v:brief", label: "Brief", hint: "Page", icon: "flag", run: () => go("@brief") },
    { id: "v:insp", label: "Inspiration board", hint: "View", icon: "image", run: () => setView("inspiration") },
    { id: "v:settings", label: "Book settings, sharing & history", hint: "View", icon: "gear", run: () => setView("settings") },
    ...model.chapters.map(c => ({ id: "c" + c.number, label: c.label, hint: "Chapter", icon: "file", run: () => go(c.authorPath ?? c.currentPath) })),
    ...model.entities.map(e => ({ id: e.id, label: e.name, hint: KIND_LABEL[e.kind], icon: e.kind === "place" ? "pin" : "person", run: () => { go(e.path, { anchor: e.slug }); selectEntity(e.id); } })),
    ...model.companions.filter(d => d.group !== "source" || d.path.endsWith(".md")).map(d => ({ id: d.path, label: d.title, hint: d.group === "research" ? "Research" : "Page", icon: "file", run: () => go(d.path) })),
  ], [model, go, setView, selectEntity]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter(i => words.every(w => (i.label + " " + i.hint).toLowerCase().includes(w))).slice(0, 40);
  useEffect(() => setIndex(0), [q]);
  return (
    <div className="dialog-backdrop palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-label="Jump to">
        <div className="palette-input"><Icon name="search" size={16} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Jump to a chapter, character, place or page…"
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && results[index]) { results[index].run(); onClose(); }
              else if (e.key === "Escape") onClose();
            }} />
        </div>
        <div className="palette-list">
          {results.map((r, i) => (
            <button key={r.id} className={`palette-item ${i === index ? "on" : ""}`} onMouseEnter={() => setIndex(i)} onClick={() => { r.run(); onClose(); }}>
              <Icon name={r.icon} size={15} /><span className="palette-label">{r.label}</span><span className="palette-hint">{r.hint}</span>
            </button>
          ))}
          {!results.length && <div className="palette-empty">Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

function HoverCard() {
  const model = useBookStore(s => s.model);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("[data-entity]") as HTMLElement | null;
      clearTimeout(timer.current);
      if (el) {
        const r = el.getBoundingClientRect();
        timer.current = setTimeout(() => setHover({ id: el.dataset.entity!, x: r.left, y: r.bottom }), 350);
      } else if (!(e.target as HTMLElement).closest?.(".hover-card")) timer.current = setTimeout(() => setHover(null), 150);
    };
    document.addEventListener("mouseover", over);
    return () => { document.removeEventListener("mouseover", over); clearTimeout(timer.current); };
  }, []);
  const entity = hover && model?.entities.find(e => e.id === hover.id);
  if (!entity || !hover) return null;
  const left = Math.min(hover.x, window.innerWidth - 340);
  const top = hover.y + 8 + 200 > window.innerHeight ? hover.y - 210 : hover.y + 8;
  return (
    <div className="hover-card" style={{ left, top }}>
      <div className="hover-card-kind">{KIND_LABEL[entity.kind]}</div>
      <div className="hover-card-name">{entity.name}</div>
      <p>{entity.summary.replace(/^Role:\s*/i, "") || "No description yet."}</p>
      <div className="hover-card-hint">Click to open in the side panel · Middle-click for a new tab</div>
    </div>
  );
}


type MenuEntry = { label: string; run: () => void; meta?: string; active?: boolean; dot?: string; num?: number; noTab?: boolean } | { heading: string } | { sep: true };

/** The sections of the book, each with a menu of what's in it. */
function MenuBar({ onNewChapter }: { onNewChapter: () => void }) {
  const model = useBookStore(s => s.model)!;
  const view = useBookStore(s => s.view);
  const location = useBookStore(s => s.location);
  const go = useBookStore(s => s.go);
  const setView = useBookStore(s => s.setView);
  const { isOwner } = useAccess();
  const [open, setOpen] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { setOpen(null); clearTimeout(hoverTimer.current); }, [location.nonce, view]);

  const section = view === "write" ? (location.path.startsWith("craft/") ? "craft" : location.path.startsWith("research/") || location.path === "@sources" ? "research" : "write") : view;
  const docs = (group: string) => model.companions.filter(d => d.group === group && !d.isAsset);
  const entityFiles = model.companions.filter(d => entityKindForPath(d.path)).map(d => d.path);
  const pageEntry = (d: { path: string; title: string }, meta?: string): MenuEntry => ({ label: d.title, meta, run: () => go(d.path), active: location.path === d.path });
  const research = docs("research");
  const researchFolders = [...new Set(research.map(d => d.path.split("/").slice(1, -1).join("/")))];

  const menus: Array<{ id: string; label: string; icon: string; run: () => void; items: MenuEntry[] }> = [
    { id: "write", label: "Manuscript", icon: "pen", run: () => setView("write"), items: [
      { label: "Title page", run: () => go(""), active: view === "write" && location.path === "" },
      { heading: `Chapters · ${model.chapters.length}` },
      ...model.chapters.map(c => ({ label: c.title || `Chapter ${c.number}`, num: c.number, dot: chapterState(c).key, run: () => go(c.authorPath ?? c.currentPath), active: chapterForPath(model.chapters, location.path)?.number === c.number })),
      { sep: true } as const,
      ...(isOwner ? [{ label: "New chapter…", run: onNewChapter, noTab: true }] : []),
      { label: "Book configuration", run: () => setView("settings"), active: view === "settings" },
    ] },
    { id: "plan", label: "Plan", icon: "grid", run: () => setView("plan"), items: [
      { label: "Brief", run: () => go("@brief"), active: location.path === "@brief" },
      { label: "All chapters", meta: String(model.chapters.length), run: () => go("", { view: "plan" }), active: view === "plan" && !location.path },
      ...(docs("plan").length ? [{ heading: "Planning pages" } as const, ...docs("plan").map(d => pageEntry(d))] : []),
    ] },
    { id: "bible", label: "Bible", icon: "person", run: () => setView("bible"), items: [
      { label: "Overview", meta: String(model.entities.length), run: () => go("", { view: "bible" }), active: view === "bible" && !location.path },
      ...(entityFiles.length ? [{ heading: "Cards" } as const, ...entityFiles.map(p => ({ label: model.companions.find(d => d.path === p)?.title ?? p, meta: String(model.entities.filter(e => e.path === p).length), run: () => go(p, { view: "bible" }), active: location.path === p }))] : []),
      ...(() => { const pages = [...docs("story"), ...docs("bible")].filter(d => !entityFiles.includes(d.path)); return pages.length ? [{ heading: "Pages" } as const, ...pages.map(d => pageEntry(d))] : []; })(),
    ] },
    ...(docs("craft").length ? [{ id: "craft", label: "Craft", icon: "feather", run: () => go(docs("craft")[0].path), items: docs("craft").map(d => pageEntry(d)) }] : []),
    { id: "research", label: "Research", icon: "search", run: () => go(research[0]?.path ?? "@sources", { view: "write" }), items: [
      { label: "Sources", run: () => go("@sources", { view: "write" }), active: location.path === "@sources" },
      ...researchFolders.flatMap(folder => {
        const inFolder = research.filter(d => d.path.split("/").slice(1, -1).join("/") === folder);
        return [...(folder ? [{ heading: folder.replace(/[-_]/g, " ").replace(/\//g, " › ") } as const] : research.length ? [{ heading: "Pages" } as const] : []), ...inFolder.map(d => pageEntry(d))];
      }),
    ] },
  ];

  return (
    <nav className="menubar" aria-label="Book" ref={ref} onMouseLeave={() => clearTimeout(hoverTimer.current)}>
      {menus.map(m => (
        <div key={m.id} className={`menubar-item ${section === m.id ? "on" : ""} ${open === m.id ? "open" : ""}`}
          onMouseEnter={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(m.id), open ? 0 : 220); }}
          onMouseLeave={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(o => (o === m.id ? null : o)), 260); }}>
          <button className="menubar-btn" onClick={() => { setOpen(null); m.run(); }}><Icon name={m.icon} size={15} /> <span className="menubar-label">{m.label}</span></button>
          <button className="menubar-caret" aria-label={`${m.label} menu`} aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}><Icon name="down" size={12} /></button>
          {open === m.id && (
            <div className="menu menubar-menu" role="menu">
              {m.items.map((it, i) => "sep" in it ? <div key={i} className="menu-sep" /> : "heading" in it ? <div key={i} className="menu-label">{it.heading}</div> : (
                <button key={i} role="menuitem" data-no-tab={it.noTab || undefined} className={`menu-item ${it.active ? "current" : ""}`} onClick={() => { setOpen(null); it.run(); }}>
                  {it.num != null && <span className="menu-num">{it.num}</span>}
                  {it.dot && <span className={`status-dot ${it.dot}`} />}
                  <span className="menu-item-text">{it.label}</span>
                  {it.meta && <span className="menu-meta">{it.meta}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className={`menubar-item ${view === "inspiration" ? "on" : ""}`}>
        <button className="menubar-btn solo" onClick={() => setView("inspiration")}><Icon name="image" size={15} /> <span className="menubar-label">Inspiration</span></button>
      </div>
    </nav>
  );
}

let firstUrlSync = true;

/** Keep the address bar and browser tab title in step with what's on screen, and follow back/forward. */
function useUrlSync() {
  const catalog = useProjectStore(s => s.projectCatalog);
  const currentProjectId = useProjectStore(s => s.currentProjectId);
  const switchProject = useProjectStore(s => s.switchProject);
  const bookProject = useBookStore(s => s.projectId);
  const model = useBookStore(s => s.model);
  const view = useBookStore(s => s.view);
  const location = useBookStore(s => s.location);
  const visibleChapter = useBookStore(s => s.visibleChapter);
  const applied = useRef<string | null>(null);
  const justApplied = useRef(false);
  const replaceNext = useRef(false);
  const catalogTitle = catalog.find(p => p.id === (bookProject ?? currentProjectId))?.name;

  // Keep the browser tab title reflecting the book and current view/chapter.
  useEffect(() => {
    document.title = studioDocumentTitle(catalogTitle, model, view, location.path, location.anchor, visibleChapter);
  }, [catalogTitle, model, view, location.path, location.anchor, visibleChapter]);

  // Opening a book: show the place the address names, if it names this book.
  useEffect(() => {
    if (!model || !bookProject || applied.current === bookProject) return;
    applied.current = bookProject;
    const threadParam = new URLSearchParams(window.location.search).get("thread");
    if (threadParam) {
      useBookStore.getState().setPanel("comments", true);
      useBookStore.getState().setActiveThread(threadParam);
    }
    if (navFlags.openLastPlace) { navFlags.openLastPlace = false; replaceNext.current = true; return; }
    if (bookIdForSlug(catalog, urlBookSlug()) === bookProject) {
      const route = urlToRoute(window.location.pathname, window.location.hash, model);
      if (route) { justApplied.current = true; useBookStore.getState().applyRoute(route); }
    }
  }, [model, bookProject, catalog]);

  // What's on screen → address bar.
  useEffect(() => {
    if (!model || !bookProject || applied.current !== bookProject) return;
    const first = firstUrlSync;
    firstUrlSync = false;
    // The route from the address is being applied; this run still sees the old location.
    if (justApplied.current) { justApplied.current = false; return; }
    const url = routeToUrl(bookSlug(catalog, bookProject), { view, path: location.path, anchor: location.anchor }, model);
    if (url === window.location.pathname + window.location.hash) return;
    if (first || replaceNext.current || window.location.pathname === "/") { replaceNext.current = false; window.history.replaceState(null, "", url); }
    else window.history.pushState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, location.nonce, bookProject, applied.current, model ? 1 : 0]);

  // Scrolling through the manuscript keeps the address on the chapter you're reading.
  useEffect(() => {
    if (!model || !bookProject || view !== "write" || !visibleChapter || !location.path) return;
    if (!chapterForPath(model.chapters, location.path)) return;
    const c = model.chapters.find(x => x.number === visibleChapter);
    if (!c) return;
    const url = routeToUrl(bookSlug(catalog, bookProject), { view: "write", path: c.authorPath ?? c.currentPath }, model);
    if (url !== window.location.pathname + window.location.hash) window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChapter]);

  // Back and forward.
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === "/") return; // the workspace takes over
      const id = bookIdForSlug(catalog, urlBookSlug());
      const book = useBookStore.getState();
      if (id && id !== book.projectId) { void switchProject(id); return; }
      if (!book.model) return;
      const route = urlToRoute(window.location.pathname, window.location.hash, book.model);
      if (route) book.applyRoute(route);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [catalog, switchProject]);
}

function Presence() {
  const editors = useProjectStore(s => s.activeEditors);
  const userId = useAuthStore(s => s.userId);
  const model = useBookStore(s => s.model);
  const others = editors.filter(e => e.userId !== userId);
  const unique = [...new Map(others.map(e => [e.userId, e])).values()];
  if (!unique.length) return null;
  return (
    <div className="presence" aria-label="Also here">
      {unique.slice(0, 4).map(e => {
        const ch = model ? chapterForPath(model.chapters, e.activeChapterId ?? "") : undefined;
        return <span key={e.userId} className="avatar presence-avatar" title={`${e.displayName}${ch ? ` · in ${ch.label}` : ""}`}>{initials(e.displayName)}</span>;
      })}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const [repeat, setRepeat] = useState("");
  const [state, setState] = useState<"" | "saving" | "done">("");
  const mismatch = repeat.length > 0 && repeat !== value;
  const [error, setError] = useState("");
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog" onSubmit={async e => {
        e.preventDefault(); setError("");
        if (value !== repeat) { setError("The two passwords don’t match."); return; }
        setState("saving");
        try { await setAccountPassword(value); setState("done"); } catch (err) { setError((err as Error).message); setState(""); }
      }}>
        <h2>Set a password</h2>
        <p className="dialog-sub">Use it to sign in with your email and password, instead of a code.</p>
        <label className="field">New password<input type="password" autoComplete="new-password" autoFocus value={value} onChange={e => setValue(e.target.value)} minLength={10} /></label>
        <label className="field">Type it again<input type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} aria-invalid={mismatch} /></label>
        {value.length > 0 && value.length < 10 && <div className="field-hint">At least 10 characters.</div>}
        {mismatch && <div className="field-hint warn">The passwords don’t match yet.</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        {state === "done" && <div className="save-notice" role="status">Password saved.</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>{state === "done" ? "Close" : "Cancel"}</button>
          {state !== "done" && <button type="submit" className="btn btn-primary" disabled={state === "saving" || value.length < 10 || value !== repeat}>{state === "saving" ? "Saving…" : "Save password"}</button>}
        </div>
      </form>
    </div>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const model = useBookStore(s => s.model);
  const { isOwner, projectId } = useAccess();
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const reloadLibraries = useLibraryStore(s => s.load);
  const [place, setPlace] = useState<{ library_id: string | null; shelf_id: string | null; private: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (projectId) readBookPlacement(projectId).then(setPlace).catch(e => setError(e.message));
  }, [projectId]);

  const library = libraries.find(l => l.id === place?.library_id);
  const people = (library?.members.length ?? 0) + (library ? 1 : 0);

  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog share-dialog" role="dialog" aria-label="Share book">
        <div className="share-dialog-head">
          <div>
            <h2>Share “{model?.title ?? "this book"}”</h2>
            <p className="dialog-sub">Co-authors and editors suggest changes that you accept or reject. Viewers can read and comment.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        {place && library && (
          <label className="check-row share-privacy-row">
            <input
              type="checkbox"
              checked={place.private}
              disabled={!isOwner}
              onChange={async e => {
                if (!projectId) return;
                setError("");
                try {
                  await placeBook(projectId, { private: e.target.checked });
                  const next = await readBookPlacement(projectId);
                  setPlace(next);
                  void reloadLibraries();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            <span>
              <strong>Private to invited people</strong> — {place.private ? `The ${people} people in ${library.name} don’t see this book unless invited below.` : `Everyone in ${library.name} can open this book with their library role.`}
            </span>
          </label>
        )}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <Collaboration />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function UserMenu({ theme, setTheme, onOpenShare }: { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onOpenShare?: () => void }) {
  const email = useAuthStore(s => s.userEmail) ?? "";
  const signOut = useAuthStore(s => s.signOut);
  const setShowApiSettings = useProjectStore(s => s.setShowApiSettings);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="user-menu" ref={ref}>
      {password && <PasswordDialog onClose={() => setPassword(false)} />}
      <button className="avatar user-avatar" onClick={() => setOpen(!open)} aria-label="Account" title={email}>{initials(email)}</button>
      {open && (
        <div className="menu menu-right">
          <div className="menu-label">{email}</div>
          <button className="menu-item" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun" : "moon"} size={15} /> {theme === "dark" ? "Light" : "Dark"} appearance</button>
          {onOpenShare && <button className="menu-item" onClick={() => { setOpen(false); onOpenShare(); }}><Icon name="users" size={15} /> Share & collaborators</button>}
          <button className="menu-item" onClick={() => { setOpen(false); useBookStore.getState().setView("settings"); }}><Icon name="gear" size={15} /> Book settings</button>
          <button className="menu-item" onClick={() => { setOpen(false); setShowApiSettings(true); }}><Icon name="sparkle" size={15} /> AI assistant</button>
          <button className="menu-item" onClick={() => { setOpen(false); navigatePublic("/docs"); }}><Icon name="book" size={15} /> Documentation</button>
          <button className="menu-item" onClick={() => { setOpen(false); setPassword(true); }}><Icon name="gear" size={15} /> Set password</button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => void signOut()}><Icon name="logout" size={15} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function Studio() {
  const projectId = useProjectStore(s => s.currentProjectId);
  const load = useBookStore(s => s.load);
  const status = useBookStore(s => s.status);
  const error = useBookStore(s => s.error);
  const model = useBookStore(s => s.model);
  const view = useBookStore(s => s.view);
  const setView = useBookStore(s => s.setView);
  useSources(); // the bibliography loads with the book, so citations show as short cites
  const location = useBookStore(s => s.location);
  const go = useBookStore(s => s.go);
  const live = useBookStore(s => s.live);
  const panelOpen = useBookStore(s => s.panelOpen);
  const focusMode = useBookStore(s => s.focusMode);
  const setFocusMode = useBookStore(s => s.setFocusMode);
  const selectEntity = useBookStore(s => s.selectEntity);
  const session = useEditorBus(s => s.session);
  const [palette, setPalette] = useState(false);
  const [newChapter, setNewChapter] = useState(false);
  const [sharing, setSharing] = useState(false);
  const narrow = () => window.innerWidth <= 1080;
  const [navOpen, setNavOpenState] = useState(() => (narrow() ? false : prefs().navOpen ?? true));
  const setNavOpen = (open: boolean) => { setNavOpenState(open); if (!narrow()) writePrefs({ navOpen: open }); };
  // On small screens the contents and side panel are overlays: close them after navigating.
  useEffect(() => {
    if (!narrow()) return;
    setNavOpenState(false);
    if (useBookStore.getState().panelOpen) useBookStore.setState({ panelOpen: false });
  }, [location.nonce]);
  const [theme, setTheme] = useTheme();
  const { role } = useAccess();
  const library = useLibraryStore(s => s.current());
  const librariesFresh = useLibraryStore(s => s.fresh);
  const loadLibraries = useLibraryStore(s => s.load);
  useEffect(() => { if (!librariesFresh) void loadLibraries(); }, [librariesFresh, loadLibraries]);
  useUrlSync();

  useEffect(() => { if (projectId) void load(projectId); }, [projectId, load]);
  useEffect(() => { if (model) preloadViews(); }, [model]);
  useEffect(() => {
    if (view !== "write") document.querySelector(".main-scroll")?.scrollTo({ top: 0 });
  }, [view]);

  // Presence: tell collaborators where you are.
  useEffect(() => {
    if (session?.path) useProjectStore.getState().setActiveChapterId(session.path);
  }, [session?.path]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
      if (e.key === "Escape" && focusMode) setFocusMode(false);
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") { e.preventDefault(); setFocusMode(!focusMode); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focusMode, setFocusMode]);

  // Linked text: entity names, markdown links, and chapter anchors navigate (or open in a new tab on middle-click / Cmd-click).
  function handleBodyLink(e: React.MouseEvent, forceNewTab: boolean) {
    const target = e.target as HTMLElement;
    const openTab = forceNewTab || e.metaKey || e.ctrlKey;
    const catalog = useProjectStore.getState().projectCatalog;
    const slug = projectId ? bookSlug(catalog, projectId) : "";

    const commentMark = target.closest("[data-thread]") as HTMLElement | null;
    if (commentMark && !forceNewTab && !window.getSelection()?.toString()) {
      const threadId = commentMark.dataset.thread;
      if (threadId && threadId !== "__draft__") {
        useBookStore.getState().setPanel("comments", true);
        useBookStore.getState().setActiveThread(threadId);
      }
      return;
    }

    const entity = target.closest("[data-entity]") as HTMLElement | null;
    if (entity && model && !window.getSelection()?.toString()) {
      const ent = model.entities.find(x => x.id === entity.dataset.entity);
      if (openTab && ent && slug) {
        e.preventDefault();
        openInNewTab(routeToUrl(slug, { view: "bible", path: ent.path, anchor: ent.slug }, model));
        return;
      }
      if (!forceNewTab) selectEntity(entity.dataset.entity!);
      return;
    }

    const link = target.closest(".doc-prose a[href], .md a[href]") as HTMLAnchorElement | null;
    if (link && model) {
      const href = link.getAttribute("href") ?? "";
      const editing = !!target.closest("[contenteditable=true]");
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        e.preventDefault();
        if (/^(?:https?|mailto):/i.test(href) && (forceNewTab || !editing || e.metaKey || e.ctrlKey)) {
          openInNewTab(href);
        }
        return;
      }
      e.preventDefault();
      if (!forceNewTab && editing && !(e.metaKey || e.ctrlKey)) return;
      const route = resolveInternalHref(href, location.path, model);
      if (route) {
        if (openTab && slug) openInNewTab(routeToUrl(slug, route, model));
        else go(route.path, { anchor: route.anchor });
      }
      return;
    }

    const chip = target.closest(".anchor-chip[data-anchor]") as HTMLElement | null;
    if (chip && model) {
      const a = parseAnchor(chip.dataset.anchor!);
      const n = a.refs[0]?.chapters[0];
      const chapter = model.chapters.find(c => c.number === n);
      if (!chapter) return;
      const path = chapter.authorPath ?? chapter.currentPath;
      if (openTab && slug) { e.preventDefault(); openInNewTab(routeToUrl(slug, { view: "write", path }, model)); return; }
      go(path, { find: a.quote });
      return;
    }

    const anchor = target.closest("[data-chapters]") as HTMLElement | null;
    if (anchor && model && (forceNewTab || e.metaKey || e.ctrlKey || !target.closest("[contenteditable=true]"))) {
      const n = anchorNumbers(anchor.dataset.chapters!)[0];
      const chapter = model.chapters.find(c => c.number === n);
      if (!chapter) return;
      if (openTab && slug) {
        e.preventDefault();
        openInNewTab(routeToUrl(slug, { view: "write", path: chapter.authorPath ?? chapter.currentPath }, model));
        return;
      }
      const block = anchor.closest("p,li,td,blockquote") ?? anchor.parentElement;
      let find: string | undefined;
      if (block) {
        const range = document.createRange();
        range.setStartAfter(anchor);
        range.setEndAfter(block.lastChild ?? block);
        find = range.toString().match(/^\s*:?\s*[“"]([^”"]{3,160})[”"]/)?.[1];
      }
      go(chapter.authorPath ?? chapter.currentPath, { find });
    }
  }

  if (status === "error") return <div className="studio-message"><h2>We couldn’t open this book</h2><p>{error}</p><button className="btn" onClick={() => projectId && void load(projectId)}>Try again</button></div>;
  if (!model) return <div className="studio-message"><span className="spinner" /> Opening your book…</div>;

  const path = location.path;
  const isChapter = path === "" || !!chapterForPath(model.chapters, path);
  const entityFile = !!entityKindForPath(path);
  const timelineFile = /^bible\/.*(timeline|chronology)[^/]*\.md$/i.test(path);
  let content: React.ReactNode = null;
  let isDoc = false;
  if (view === "write") {
    content = path === "@brief" ? <BriefPage /> : path === "@sources" ? <SourcesPage focus={location.anchor} /> : isChapter ? <ManuscriptView /> : <CompanionView />;
    isDoc = path !== "@brief" && path !== "@sources";
  } else if (view === "plan") {
    const scenes = path.startsWith("outline/scenes/");
    content = !path ? <PlanBoard /> : path === "@brief" ? <BriefPage /> : scenes ? <ChapterPlanPage path={path} anchor={location.anchor} /> : <CompanionView />;
    isDoc = !!path && path !== "@brief" && !scenes;
  } else if (view === "bible") {
    if (!path) content = <BibleBoard />;
    else if (entityFile && location.anchor && location.anchor !== FULL_PAGE) content = <EntityPage path={path} slug={location.anchor} />;
    else if (entityFile && !location.anchor) content = <EntityIndex path={path} />;
    else if (timelineFile && location.anchor !== FULL_PAGE) content = <TimelinePage path={path} />;
    else content = <CompanionView />;
    isDoc = !!path && (!entityFile || !!location.anchor) && !(timelineFile && location.anchor !== FULL_PAGE);
  }
  const scope = navScopeFor(view, path, model.companions.find(d => d.path === path)?.group);
  const showPanel = isDoc || (view === "write" && path !== "@brief");

  return (
    <div className={`studio ${focusMode ? "focus" : ""} ${navOpen && scope ? "" : "nav-closed"} ${panelOpen && showPanel ? "" : "panel-closed"}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={() => setNavOpen(!navOpen)} aria-label={navOpen ? "Hide contents" : "Show contents"} title="Contents"><Icon name="sidebar" size={18} /></button>
          <button className="brand brand-home" onClick={() => useHomeStore.getState().showHome()} title={library ? `${library.name} home` : "All your books"}><span className="brand-mark">b</span><span className="brand-name">bookkit</span></button>
          {library && <><span className="topbar-slash">/</span><button className="lib-crumb" onClick={() => useHomeStore.getState().showHome()}>{library.name}</button></>}
          <span className="topbar-slash">/</span>
          <BookSwitcher />
        </div>
        <MenuBar onNewChapter={() => setNewChapter(true)} />
        <div className="topbar-right">
          <button className="search-trigger" onClick={() => setPalette(true)}><Icon name="search" size={14} /> <span>Jump to…</span> <kbd>⌘K</kbd></button>
          <span className={`live-dot ${live === "SUBSCRIBED" ? "on" : ""}`} title={live === "SUBSCRIBED" ? "Live: changes from collaborators appear as they save" : "Reconnecting…"} />
          <Presence />
          <button className={`btn btn-sm share-btn ${sharing ? "on" : ""}`} onClick={() => setSharing(true)} title="Share & manage collaborators"><Icon name="users" size={14} /> <span>Share</span></button>
          <button className={`btn btn-sm settings-btn ${view === "settings" ? "on" : ""}`} onClick={() => setView("settings")} title="Book settings, configuration, export & history"><Icon name="gear" size={14} /> <span className="hide-sm">Settings</span></button>
          <UserMenu theme={theme} setTheme={setTheme} onOpenShare={() => setSharing(true)} />
        </div>
      </header>
      <div className="studio-body" onClick={e => handleBodyLink(e, false)} onAuxClick={e => { if (e.button === 1) handleBodyLink(e, true); }}>
        {scope && navOpen && <Navigator scope={scope} onNewChapter={() => setNewChapter(true)} />}
        <main className="studio-main">
          {isDoc && <Toolbar />}
          <div className="main-scroll">
            <ErrorBoundary resetKey={`${view}:${location.path}:${location.nonce}`}>
              <Suspense fallback={<div className="studio-message quiet"><span className="spinner" /></div>}>
                {content}
                {view === "inspiration" && <div className="inspiration-host"><Inspiration /></div>}
                {view === "settings" && <BookSettings />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        {showPanel && panelOpen && (
          <ErrorBoundary resetKey={location.path}>
            <Suspense fallback={null}>
              <ContextPanel />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
      {focusMode && <button className="focus-exit" onClick={() => setFocusMode(false)}>Exit focus · Esc</button>}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {newChapter && <NewChapterDialog onClose={() => setNewChapter(false)} />}
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
      <HoverCard />
      <ChipPopover />
      <ListenBar />
    </div>
  );
}
