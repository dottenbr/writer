import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { useAuthStore } from "../store/useAuthStore";
import { useHomeStore } from "../store/useHomeStore";
import { createLibrary, LIBRARY_SLUG, loadWorkspace, placeBook, type Library, type WorkspaceBook } from "../lib/supabase-service";
import { useLibraryStore, canWriteIn } from "../store/useLibraryStore";
import { hostLibrary, libraryUrl } from "../lib/library-host";
import { LibrarySettings } from "./LibrarySettings";
import { bookSlug, navFlags } from "../lib/book-url";
import { NewBookDialog, UserMenu, useTheme } from "./studio/Studio";
import { formatWords, Icon } from "./studio/common";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function ago(when: string | null): string {
  if (!when) return "Not yet";
  const s = (Date.now() - Date.parse(when)) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(when).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Sequential steps of the accent hue for activity; 0 is the empty cell. */
const level = (n: number, max: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4)));

interface DayTotal { day: string; edits: number; words: number; books: string[] }

function useDays(books: WorkspaceBook[], days: number): DayTotal[] {
  return useMemo(() => {
    const map = new Map<string, DayTotal>();
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) { const d = iso(new Date(today.getTime() - i * DAY)); map.set(d, { day: d, edits: 0, words: 0, books: [] }); }
    for (const b of books) for (const a of b.activity) {
      const t = map.get(a.day);
      if (!t) continue;
      t.edits += a.edits; t.words += a.words; if (a.edits) t.books.push(b.name);
    }
    return [...map.values()];
  }, [books, days]);
}

/** Twelve weeks of work across every book, one cell per day. */
function ActivityCalendar({ days }: { days: DayTotal[] }) {
  const [hover, setHover] = useState<{ d: DayTotal; x: number; y: number } | null>(null);
  const max = Math.max(...days.map(d => d.edits), 1);
  // Pad the start so columns are weeks starting on Monday.
  const first = new Date(days[0].day + "T00:00:00Z");
  const pad = (first.getUTCDay() + 6) % 7;
  const cells: Array<DayTotal | null> = [...Array(pad).fill(null), ...days];
  const weeks: Array<Array<DayTotal | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const months = weeks.map((w, i) => {
    const d = w.find(Boolean);
    if (!d) return "";
    const m = new Date(d.day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
    const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
    return !prev || new Date(prev.day + "T00:00:00Z").getUTCMonth() !== new Date(d.day + "T00:00:00Z").getUTCMonth() ? m : "";
  });
  return (
    <div className="ws-cal" onMouseLeave={() => setHover(null)}>
      <div className="ws-cal-grid" role="img" aria-label="Writing activity for the last twelve weeks">
        <div className="ws-cal-days" aria-hidden><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
        {weeks.map((w, i) => (
          <div key={i} className="ws-cal-week">
            <div className="ws-cal-month" aria-hidden>{months[i]}</div>
            {w.map((d, j) => d ? (
              <span key={j} className={`ws-cell l${level(d.edits, max)}`}
                onMouseEnter={e => { const r = (e.target as HTMLElement).getBoundingClientRect(); setHover({ d, x: r.left + r.width / 2, y: r.top }); }} />
            ) : <span key={j} className="ws-cell blank" />)}
          </div>
        ))}
      </div>
      <div className="ws-cal-key" aria-hidden><span>Less</span>{[0, 1, 2, 3, 4].map(l => <span key={l} className={`ws-cell l${l}`} />)}<span>More</span></div>
      {hover && (
        <div className="ws-tip" style={{ left: hover.x, top: hover.y }}>
          <strong>{new Date(hover.d.day + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</strong>
          <span>{hover.d.edits ? `${hover.d.edits} save${hover.d.edits === 1 ? "" : "s"}` : "No writing"}{hover.d.words ? ` · ${hover.d.words > 0 ? "+" : ""}${hover.d.words.toLocaleString()} words` : ""}</span>
          {hover.d.books.length > 0 && <span className="muted">{[...new Set(hover.d.books)].join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

/** The last 30 days of one book as small bars. */
function Spark({ book }: { book: WorkspaceBook }) {
  const days = useDays([book], 30);
  const max = Math.max(...days.map(d => d.edits), 1);
  return (
    <div className="ws-spark" aria-label={`Activity in the last 30 days: ${days.filter(d => d.edits).length} active days`}>
      {days.map(d => (
        <span key={d.day} className={`ws-bar ${d.edits ? "on" : ""}`} style={{ height: d.edits ? `${Math.max(14, (d.edits / max) * 100)}%` : undefined }}
          title={`${new Date(d.day + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}: ${d.edits ? `${d.edits} saves` : "no writing"}`} />
      ))}
    </div>
  );
}

function BookCard({ book, onOpen, featured, library }: { book: WorkspaceBook; onOpen: () => void; featured?: boolean; library?: Library }) {
  const target = book.target_words || 0;
  const pct = target ? Math.min(100, Math.round((book.author_words / target) * 100)) : 0;
  const chapters = book.chapters_total || 0;
  const recent = book.activity.filter(a => Date.parse(a.day) > Date.now() - 7 * DAY).reduce((n, a) => n + a.edits, 0);
  return (
    <button className={`ws-book ${featured ? "featured" : ""}`} onClick={onOpen}>
      <div className="ws-book-top">
        <div className="ws-cover" aria-hidden><span>{book.name.replace(/^(the|a|an)\s+/i, "").slice(0, 1).toUpperCase()}</span></div>
        <div className="ws-book-head">
          <div className="ws-book-title">{book.name}</div>
          <div className="ws-book-meta">
            {library ? <span>{library.name}</span> : book.role !== "owner" ? <>{book.owner_name ? `${book.owner_name}’s book` : "Shared"}</> : "Your book"}
            {book.role !== "owner" && <span className="ws-role">{book.role === "viewer" ? "reader" : book.role}</span>}
            {book.private && <span className="ws-role">private</span>}
            {!book.is_bookkit && <span className="ws-role">classic</span>}
          </div>
        </div>
        {featured && <span className="btn btn-primary btn-sm ws-continue"><Icon name="pen" size={13} /> Continue</span>}
      </div>
      <div className="ws-progress">
        <div className="ws-progress-row">
          <span><strong>{formatWords(book.author_words)}</strong> words written{target ? <span className="muted"> of {formatWords(target)}</span> : null}</span>
          {target > 0 && <span className="muted">{pct}%</span>}
        </div>
        <div className="ws-progress-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="ws-progress-row small muted">
          <span>{chapters ? `${book.chapters_written} of ${chapters} chapters` : "No chapters yet"}</span>
          {book.draft_words > 0 && <span>{formatWords(book.draft_words)} in the reference draft</span>}
        </div>
      </div>
      <div className="ws-book-foot">
        <div className="ws-last">
          <span className="ws-last-label">Last worked on</span>
          <span>{ago(book.last_worked_at)}{book.last_worked_by && book.role !== "owner" ? ` · ${book.last_worked_by}` : ""}</span>
          {recent > 0 && <span className="muted">{recent} saves this week</span>}
        </div>
        <Spark book={book} />
      </div>
    </button>
  );
}

function useBooks() {
  const catalogLength = useProjectStore(s => s.projectCatalog.length);
  const [books, setBooks] = useState<WorkspaceBook[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    loadWorkspace().then(b => { if (live) setBooks(b); }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [catalogLength, version]);
  return { books, error, reload: () => setVersion(v => v + 1) };
}

function firstName(books: WorkspaceBook[], email: string) {
  const own = books.find(b => b.role === "owner")?.owner_name ?? "";
  return (own && !own.includes("@") ? own : email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase())).split(" ")[0];
}

function Overview({ books }: { books: WorkspaceBook[] }) {
  const days = useDays(books, 84);
  const activeDays = days.slice(-30).filter(d => d.edits).length;
  const weekWords = days.slice(-7).reduce((n, d) => n + d.words, 0);
  const words = books.reduce((n, b) => n + b.author_words, 0);
  const draftWords = books.reduce((n, b) => n + b.draft_words, 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].edits) streak++; else if (i === days.length - 1) continue; else break; }
  return (
    <section className="ws-overview">
      <div className="ws-stats">
        <div className="ws-stat"><span className="ws-stat-label">Words written</span><strong>{formatWords(words)}</strong><span className="muted">across {books.length} book{books.length === 1 ? "" : "s"}</span></div>
        <div className="ws-stat"><span className="ws-stat-label">This week</span><strong>{weekWords > 0 ? "+" : ""}{formatWords(weekWords)}</strong><span className="muted">words in the manuscripts</span></div>
        <div className="ws-stat"><span className="ws-stat-label">Active days</span><strong>{activeDays}<span className="ws-of"> / 30</span></strong><span className="muted">{streak > 1 ? `${streak}-day streak` : "in the last month"}</span></div>
        <div className="ws-stat"><span className="ws-stat-label">Reference drafts</span><strong>{formatWords(draftWords)}</strong><span className="muted">words to write from</span></div>
      </div>
      <div className="ws-activity">
        <div className="ws-section-head"><h2>Activity</h2><span className="muted">Saves per day, last 12 weeks</span></div>
        <ActivityCalendar days={days} />
      </div>
    </section>
  );
}

/** Jump between libraries. */
function LibrarySwitcher({ current }: { current: Library | null | undefined }) {
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="book-switcher" ref={ref}>
      <button className="book-switcher-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="book-switcher-name">{current ? current.name : "All libraries"}</span><Icon name="down" size={14} />
      </button>
      {open && (
        <div className="menu book-menu">
          <a className={`menu-item ${current === null ? "current" : ""}`} href={libraryUrl(null)}><Icon name="grid" size={15} /> <span className="menu-item-text">All libraries</span></a>
          <div className="menu-sep" />
          <div className="menu-label">Libraries</div>
          {libraries.map(l => (
            <a key={l.id} className={`menu-item ${current?.id === l.id ? "current" : ""}`} href={libraryUrl(l.slug)}>
              <Icon name="book" size={15} /><span className="menu-item-text">{l.name}</span>
              <span className="menu-meta host">{l.slug}.bookkit.net</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar({ current, children }: { current: Library | null | undefined; children?: React.ReactNode }) {
  const [theme, setTheme] = useTheme();
  return (
    <header className="topbar ws-topbar">
      <div className="topbar-left">
        <a className="brand brand-home" href={libraryUrl(null)} title="All libraries"><span className="brand-mark">b</span><span className="brand-name">bookkit</span></a>
        <span className="topbar-slash">/</span>
        <LibrarySwitcher current={current} />
      </div>
      <div className="topbar-right">
        {children}
        <UserMenu theme={theme} setTheme={setTheme} />
      </div>
    </header>
  );
}

/** Open a book: in place when it lives in this library, otherwise at its library's address. */
function useOpenBook() {
  const catalog = useProjectStore(s => s.projectCatalog);
  const currentId = useProjectStore(s => s.currentProjectId);
  const switchProject = useProjectStore(s => s.switchProject);
  const setHome = useHomeStore(s => s.setHome);
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  return (b: WorkspaceBook) => {
    const slug = libraries.find(l => l.id === b.library_id)?.slug ?? null;
    const path = "/" + bookSlug(catalog, b.project_id);
    if (slug !== hostLibrary()) { window.location.href = libraryUrl(slug, path); return; }
    navFlags.openLastPlace = true;
    window.history.pushState(null, "", path);
    setHome(false);
    if (b.project_id !== currentId) void switchProject(b.project_id);
  };
}

/** Shelf, library and privacy for one book, from its card. */
function BookMenu({ book, library, onChanged }: { book: WorkspaceBook; library: Library; onChanged: () => void }) {
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const reloadLibraries = useLibraryStore(s => s.load);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const owner = book.role === "owner";
  const canShelve = owner || canWriteIn(library);
  if (!canShelve) return null;
  const run = async (patch: Parameters<typeof placeBook>[1]) => {
    setError("");
    try { await placeBook(book.project_id, patch); setOpen(false); onChanged(); void reloadLibraries(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="ws-book-menu" ref={ref} onClick={e => e.stopPropagation()}>
      <button className="icon-btn" aria-label={`Options for ${book.name}`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="more" size={16} /></button>
      {open && (
        <div className="menu menu-right">
          <div className="menu-label">Shelf</div>
          {library.shelves.map(s => (
            <button key={s.id} className={`menu-item ${book.shelf_id === s.id ? "current" : ""}`} onClick={() => void run({ shelf_id: s.id })}>
              <span className="menu-item-text">{s.name}</span>{book.shelf_id === s.id && <Icon name="check" size={14} />}
            </button>
          ))}
          <button className={`menu-item ${!book.shelf_id ? "current" : ""}`} onClick={() => void run({ shelf_id: null })}><span className="menu-item-text">No shelf</span>{!book.shelf_id && <Icon name="check" size={14} />}</button>
          {owner && <>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => void run({ private: !book.private })}>
              <Icon name={book.private ? "users" : "close"} size={15} /><span className="menu-item-text">{book.private ? "Share with the library again" : "Make private"}</span>
            </button>
            {libraries.filter(l => l.id !== library.id && canWriteIn(l)).length > 0 && <div className="menu-label">Move to library</div>}
            {libraries.filter(l => l.id !== library.id && canWriteIn(l)).map(l => (
              <button key={l.id} className="menu-item" onClick={() => void run({ library_id: l.id })}><Icon name="book" size={15} /><span className="menu-item-text">{l.name}</span></button>
            ))}
          </>}
          {error && <div className="inline-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}

function LibraryHome({ library }: { library: Library }) {
  const email = useAuthStore(s => s.userEmail) ?? "";
  const { books, error, reload } = useBooks();
  const open = useOpenBook();
  const reloadLibraries = useLibraryStore(s => s.load);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  useEffect(() => { document.title = `${library.name} · Bookkit`; }, [library.name]);
  const all = (books ?? []).filter(b => b.library_id === library.id);
  const shown = all.filter(b => !query || b.name.toLowerCase().includes(query.toLowerCase()));
  const latest = all.find(b => b.last_worked_at);
  const shelves = [...library.shelves].sort((a, b) => a.position - b.position);
  const groups = [...shelves.map(s => ({ id: s.id as string | null, name: s.name, books: shown.filter(b => b.shelf_id === s.id) })),
    { id: null, name: shelves.length ? "Not on a shelf" : "Books", books: shown.filter(b => !b.shelf_id || !shelves.some(s => s.id === b.shelf_id)) }]
    .filter(g => g.id !== null || g.books.length > 0 || !shelves.length);
  const roleLabel = library.role === "owner" ? "Your library" : library.role === "coauthor" ? "You’re a co-author" : library.role === "editor" ? "You’re an editor" : library.role === "viewer" ? "You’re a reader" : "A book here is shared with you";
  const drop = async (shelf: string | null) => {
    const id = dragging; setDragging(null); setDropOn(null);
    const book = all.find(b => b.project_id === id);
    if (!book || book.shelf_id === shelf) return;
    try { await placeBook(book.project_id, { shelf_id: shelf }); reload(); } catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="workspace">
      <TopBar current={library}>
        {canWriteIn(library) && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New book</button>}
        <button className="btn btn-sm" onClick={() => setSettings(true)}><Icon name="gear" size={14} /> <span className="hide-sm">Library settings</span></button>
      </TopBar>
      <main className="ws-main">
        <section className="ws-hero">
          <div className="ws-date">{roleLabel}{library.owner_name && library.role !== "owner" ? ` · ${library.owner_name}` : ""}</div>
          <h1>{library.name}</h1>
          {library.description && <p className="ws-sub">{library.description}</p>}
          <p className="ws-sub">{latest ? <>Hello {firstName(all, email)}. Last worked on: <button className="link-btn inline" onClick={() => open(latest)}>{latest.name}</button>, {ago(latest.last_worked_at).toLowerCase()}.</> : all.length ? "" : "No books here yet."}</p>
          {library.pending_owner && <div className="ws-pending">This library is waiting for <strong>{library.pending_owner}</strong>. It becomes theirs the first time they sign in. <button className="link-btn inline" onClick={() => setSettings(true)}>Invite them</button></div>}
        </section>
        {error && <div className="inline-error" role="alert">Couldn’t load the books: {error}</div>}
        {!books && !error && <div className="studio-message"><span className="spinner" /> Loading the shelves…</div>}
        {books && all.length > 0 && <Overview books={all} />}
        {books && all.length > 3 && (
          <div className="ws-filter"><Icon name="search" size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a book" aria-label="Find a book" /></div>
        )}
        {books && groups.map(g => (
          <section key={g.id ?? "none"} className={`ws-shelf ${dropOn === (g.id ?? "none") ? "drop" : ""}`}
            onDragOver={e => { if (dragging) { e.preventDefault(); setDropOn(g.id ?? "none"); } }}
            onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropOn(null); }}
            onDrop={e => { e.preventDefault(); void drop(g.id); }}>
            <div className="ws-section-head"><h2>{g.name}</h2><span className="muted">{g.books.length}</span></div>
            {g.books.length ? (
              <div className="ws-grid">
                {g.books.map((b, i) => (
                  <div key={b.project_id} className="ws-book-wrap" draggable={b.role === "owner" || canWriteIn(library)}
                    onDragStart={e => { setDragging(b.project_id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.name); }}
                    onDragEnd={() => { setDragging(null); setDropOn(null); }}>
                    <BookCard book={b} featured={i === 0 && g === groups[0] && !query && b.project_id === latest?.project_id} onOpen={() => open(b)} />
                    <BookMenu book={b} library={library} onChanged={reload} />
                  </div>
                ))}
              </div>
            ) : <div className="ws-shelf-empty">{dragging ? "Drop the book here" : canWriteIn(library) ? "Empty shelf. Drag a book here, or add a new one." : "Nothing on this shelf yet."}</div>}
          </section>
        ))}
      </main>
      {creating && <NewBookDialog onClose={() => setCreating(false)} />}
      {settings && <LibrarySettings library={library} onClose={() => { setSettings(false); void reloadLibraries(); reload(); }} />}
    </div>
  );
}

function LibraryCard({ library, books }: { library: Library; books: WorkspaceBook[] }) {
  const days = useDays(books, 30);
  const max = Math.max(...days.map(d => d.edits), 1);
  const last = books.map(b => b.last_worked_at).filter(Boolean).sort().pop() ?? null;
  const words = books.reduce((n, b) => n + b.author_words, 0);
  return (
    <a className="ws-library" href={libraryUrl(library.slug)}>
      <div className="ws-library-head">
        <div>
          <div className="ws-library-name">{library.name}</div>
          <div className="ws-library-host">{library.slug}.bookkit.net</div>
        </div>
        <span className="ws-role">{library.role === "owner" ? "owner" : library.role === "viewer" ? "reader" : library.role}</span>
      </div>
      {library.description && <p className="ws-library-desc">{library.description}</p>}
      <div className="ws-library-shelves">
        {library.shelves.map(s => <span key={s.id} className="ws-shelf-chip">{s.name} <b>{books.filter(b => b.shelf_id === s.id).length}</b></span>)}
        {!library.shelves.length && <span className="muted">No shelves yet</span>}
      </div>
      <div className="ws-book-foot">
        <div className="ws-last">
          <span className="ws-last-label">{books.length} book{books.length === 1 ? "" : "s"} · {formatWords(words)} words</span>
          <span>{library.pending_owner ? `Waiting for ${library.pending_owner}` : last ? `Last worked on ${ago(last).toLowerCase()}` : "Not started"}</span>
          {library.owner_name && library.role !== "owner" && !library.pending_owner && <span className="muted">{library.owner_name}’s library</span>}
        </div>
        <div className="ws-spark" aria-hidden>{days.map(d => <span key={d.day} className={`ws-bar ${d.edits ? "on" : ""}`} style={{ height: d.edits ? `${Math.max(14, (d.edits / max) * 100)}%` : undefined }} />)}</div>
      </div>
    </a>
  );
}

function NewLibraryDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const auto = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’'`]s\b/g, "").replace(/\blibrary\b/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  const value = touched ? slug : auto;
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try { await createLibrary(name, value); window.location.href = libraryUrl(value); } catch (err) { setError((err as Error).message); setBusy(false); }
      }}>
        <h2>New library</h2>
        <p className="dialog-sub">A library has its own address, its own shelves and its own people.</p>
        <label className="field">Name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Heidi’s Library" /></label>
        <label className="field">Address<div className="slug-field"><input value={value} onChange={e => { setTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} placeholder="heidi" /><span>.bookkit.net</span></div></label>
        {value && !LIBRARY_SLUG.test(value) && <div className="field-hint warn">Use lowercase letters, numbers and dashes.</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !LIBRARY_SLUG.test(value)}>{busy ? "Creating…" : "Create library"}</button>
        </div>
      </form>
    </div>
  );
}

function AllLibraries() {
  const email = useAuthStore(s => s.userEmail) ?? "";
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const { books, error } = useBooks();
  const open = useOpenBook();
  const [creating, setCreating] = useState(false);
  const [newLibrary, setNewLibrary] = useState(false);
  const importProjectZip = useProjectStore(s => s.importProjectZip);
  const [message, setMessage] = useState("");
  useEffect(() => { document.title = "Bookkit"; }, []);
  const all = books ?? [];
  const recent = all.filter(b => b.last_worked_at).slice(0, 4);
  const loose = all.filter(b => !b.library_id || !libraries.some(l => l.id === b.library_id));
  const hour = new Date().getHours();
  return (
    <div className="workspace">
      <TopBar current={null}>
        <button className="btn btn-sm" onClick={() => setNewLibrary(true)}><Icon name="plus" size={14} /> <span className="hide-sm">New library</span></button>
      </TopBar>
      <main className="ws-main">
        <section className="ws-hero">
          <div className="ws-date">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1>{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}{all.length ? `, ${firstName(all, email)}` : ""}</h1>
          <p className="ws-sub">{libraries.length ? `${libraries.length} ${libraries.length === 1 ? "library" : "libraries"}, ${all.length} book${all.length === 1 ? "" : "s"}.` : "Start with a library: your own address on bookkit.net, with shelves for your books."}</p>
        </section>
        {error && <div className="inline-error" role="alert">Couldn’t load your books: {error}</div>}
        {libraries.length > 0 && (
          <section className="ws-shelf">
            <div className="ws-section-head"><h2>Libraries</h2><span className="muted">{libraries.length}</span></div>
            <div className="ws-grid">{libraries.map(l => <LibraryCard key={l.id} library={l} books={all.filter(b => b.library_id === l.id)} />)}</div>
          </section>
        )}
        {books && all.length > 0 && <Overview books={all.some(b => b.role === "owner") ? all.filter(b => b.role === "owner") : all} />}
        {recent.length > 0 && (
          <section className="ws-shelf">
            <div className="ws-section-head"><h2>Recently worked on</h2></div>
            <div className="ws-grid">{recent.map(b => <BookCard key={b.project_id} book={b} library={libraries.find(l => l.id === b.library_id)} onOpen={() => open(b)} />)}</div>
          </section>
        )}
        {loose.length > 0 && (
          <section className="ws-shelf">
            <div className="ws-section-head"><h2>Not in a library</h2><span className="muted">{loose.length}</span></div>
            <div className="ws-grid">{loose.map(b => <BookCard key={b.project_id} book={b} onOpen={() => open(b)} />)}</div>
          </section>
        )}
        {books && !libraries.length && !all.length && (
          <section className="ws-empty">
            <h2>Your books, in one place</h2>
            <p>Write your manuscript like a document, with the plan, story bible and research one click away.</p>
            <div className="welcome-actions">
              <button className="btn btn-primary" onClick={() => setNewLibrary(true)}>Create your library</button>
              <button className="btn" onClick={() => setCreating(true)}>Start a book</button>
              <label className="btn">Import a Bookkit archive<input type="file" accept=".zip" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { await importProjectZip(file, setMessage); } catch (err) { setMessage((err as Error).message); } }} /></label>
            </div>
            {message && <p className="welcome-status" role="status">{message}</p>}
          </section>
        )}
      </main>
      {creating && <NewBookDialog onClose={() => setCreating(false)} />}
      {newLibrary && <NewLibraryDialog onClose={() => setNewLibrary(false)} />}
    </div>
  );
}

/** The home page: on bookkit.net every library; on a library's address its shelves. */
export function Workspace() {
  const libraries = useLibraryStore(s => s.libraries);
  const load = useLibraryStore(s => s.load);
  const current = useLibraryStore(s => s.current());
  useEffect(() => { if (!libraries) void load(); }, [libraries, load]);
  if (!libraries) return <div className="studio-message"><span className="spinner" /> Opening your library…</div>;
  const slug = hostLibrary();
  if (!slug) return <AllLibraries />;
  if (!current) {
    return (
      <div className="workspace">
        <TopBar current={undefined} />
        <main className="ws-main">
          <section className="ws-empty">
            <h2>No library here</h2>
            <p>There’s no library at {slug}.bookkit.net that you can open. If someone invited you, sign in with the email they used.</p>
            <a className="btn btn-primary" href={libraryUrl(null)}>See your libraries</a>
          </section>
        </main>
      </div>
    );
  }
  return <LibraryHome library={current} />;
}
