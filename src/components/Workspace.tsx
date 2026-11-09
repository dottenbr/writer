import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { useAuthStore } from "../store/useAuthStore";
import { useHomeStore } from "../store/useHomeStore";
import { loadWorkspace, type WorkspaceBook } from "../lib/supabase-service";
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

function BookCard({ book, onOpen, featured }: { book: WorkspaceBook; onOpen: () => void; featured?: boolean }) {
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
            {book.role !== "owner" ? <>{book.owner_name ? `${book.owner_name}’s book` : "Shared"} · <span className="ws-role">{book.role}</span></> : "Your book"}
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

/** The home page: all your books and the books shared with you, with progress and activity. */
export function Workspace() {
  const catalog = useProjectStore(s => s.projectCatalog);
  const currentId = useProjectStore(s => s.currentProjectId);
  const switchProject = useProjectStore(s => s.switchProject);
  const importProjectZip = useProjectStore(s => s.importProjectZip);
  const email = useAuthStore(s => s.userEmail) ?? "";
  const setHome = useHomeStore(s => s.setHome);
  const [theme, setTheme] = useTheme();
  const [books, setBooks] = useState<WorkspaceBook[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    loadWorkspace().then(b => { if (live) setBooks(b); }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [catalog.length]);
  useEffect(() => { document.title = "Bookkit"; }, []);

  const all = books ?? [];
  const days = useDays(all, 84);
  const open = (b: WorkspaceBook) => {
    navFlags.openLastPlace = true;
    window.history.pushState(null, "", "/" + bookSlug(catalog, b.project_id));
    setHome(false);
    if (b.project_id !== currentId) void switchProject(b.project_id);
  };
  const filter = (b: WorkspaceBook) => !query || b.name.toLowerCase().includes(query.toLowerCase());
  const mine = all.filter(b => b.role === "owner").filter(filter);
  const shared = all.filter(b => b.role !== "owner").filter(filter);
  const latest = all.find(b => b.last_worked_at);
  const last30 = days.slice(-30);
  const activeDays = last30.filter(d => d.edits).length;
  const weekWords = days.slice(-7).reduce((n, d) => n + d.words, 0);
  const yourWords = all.filter(b => b.role === "owner").reduce((n, b) => n + b.author_words, 0);
  const draftWords = all.reduce((n, b) => n + b.draft_words, 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].edits) streak++; else if (i === days.length - 1) continue; else break; }
  const hour = new Date().getHours();
  const ownName = all.find(b => b.role === "owner")?.owner_name ?? "";
  const name = (ownName && !ownName.includes("@") ? ownName : email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase())).split(" ")[0];

  return (
    <div className="workspace">
      <header className="topbar ws-topbar">
        <div className="topbar-left">
          <div className="brand"><span className="brand-mark">b</span><span className="brand-name">bookkit</span></div>
          <span className="topbar-slash">/</span>
          <span className="ws-crumb">Workspace</span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New book</button>
          <UserMenu theme={theme} setTheme={setTheme} />
        </div>
      </header>
      <main className="ws-main">
        <section className="ws-hero">
          <div>
            <div className="ws-date">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
            <h1>{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}{name ? `, ${name}` : ""}</h1>
            <p className="ws-sub">{latest ? <>You last worked on <button className="link-btn inline" onClick={() => open(latest)}>{latest.name}</button> {ago(latest.last_worked_at).toLowerCase()}.</> : "Start a book, or import one you’ve been writing elsewhere."}</p>
          </div>
        </section>

        {error && <div className="inline-error" role="alert">Couldn’t load your workspace: {error}</div>}
        {!books && !error && <div className="studio-message"><span className="spinner" /> Loading your books…</div>}

        {books && books.length > 0 && (
          <section className="ws-overview">
            <div className="ws-stats">
              <div className="ws-stat"><span className="ws-stat-label">Your words</span><strong>{formatWords(yourWords)}</strong><span className="muted">across {all.filter(b => b.role === "owner").length} books</span></div>
              <div className="ws-stat"><span className="ws-stat-label">This week</span><strong>{weekWords > 0 ? "+" : ""}{formatWords(weekWords)}</strong><span className="muted">words in your manuscripts</span></div>
              <div className="ws-stat"><span className="ws-stat-label">Active days</span><strong>{activeDays}<span className="ws-of"> / 30</span></strong><span className="muted">{streak > 1 ? `${streak}-day streak` : "in the last month"}</span></div>
              <div className="ws-stat"><span className="ws-stat-label">Reference drafts</span><strong>{formatWords(draftWords)}</strong><span className="muted">words to write from</span></div>
            </div>
            <div className="ws-activity">
              <div className="ws-section-head"><h2>Activity</h2><span className="muted">Saves per day, all books, last 12 weeks</span></div>
              <ActivityCalendar days={days} />
            </div>
          </section>
        )}

        {books && books.length > 0 && (
          <div className="ws-filter">
            <Icon name="search" size={14} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a book" aria-label="Find a book" />
          </div>
        )}

        {books && mine.length > 0 && (
          <section className="ws-shelf">
            <div className="ws-section-head"><h2>Your books</h2><span className="muted">{mine.length}</span></div>
            <div className="ws-grid">
              {mine.map((b, i) => <BookCard key={b.project_id} book={b} featured={i === 0 && !query && !!b.last_worked_at} onOpen={() => open(b)} />)}
            </div>
          </section>
        )}
        {books && shared.length > 0 && (
          <section className="ws-shelf">
            <div className="ws-section-head"><h2>Shared with you</h2><span className="muted">{shared.length}</span></div>
            <div className="ws-grid">{shared.map(b => <BookCard key={b.project_id} book={b} onOpen={() => open(b)} />)}</div>
          </section>
        )}
        {books && books.length === 0 && (
          <section className="ws-empty">
            <h2>Your books, in one place</h2>
            <p>Write your manuscript like a document, with the plan, story bible and research one click away.</p>
            <div className="welcome-actions">
              <button className="btn btn-primary" onClick={() => setCreating(true)}>Start a new book</button>
              <label className="btn">
                Import a Bookkit archive
                <input type="file" accept=".zip" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { await importProjectZip(file, setMessage); } catch (err) { setMessage((err as Error).message); } }} />
              </label>
            </div>
            {message && <p className="welcome-status" role="status">{message}</p>}
          </section>
        )}
        {books && books.length > 0 && (
          <div className="ws-foot">
            <label className="link-btn">Import a Bookkit archive<input type="file" accept=".zip" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { await importProjectZip(file, setMessage); } catch (err) { setMessage((err as Error).message); } }} /></label>
            {message && <span className="welcome-status" role="status">{message}</span>}
          </div>
        )}
      </main>
      {creating && <NewBookDialog onClose={() => { setCreating(false); }} />}
    </div>
  );
}
