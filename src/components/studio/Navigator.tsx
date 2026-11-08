import { useMemo, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import type { CompanionDoc, Group } from "../../lib/book-model";
import { chapterForPath, chapterState, formatWords, Icon, useAccess } from "./common";

const GROUPS: Array<{ id: Group; label: string }> = [
  { id: "story", label: "Story" },
  { id: "bible", label: "Story bible" },
  { id: "plan", label: "Plan" },
  { id: "craft", label: "Craft" },
  { id: "matter", label: "Front & back matter" },
  { id: "research", label: "Research" },
  { id: "publication", label: "Publishing" },
  { id: "source", label: "Book setup" },
];

function Section({ id, label, count, children, defaultOpen = true }: { id: string; label: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const key = "nav-open:" + id;
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  return (
    <section className={`nav-section ${open ? "open" : ""}`}>
      <button className="nav-section-head" onClick={() => { setOpen(!open); try { localStorage.setItem(key, open ? "0" : "1"); } catch { /* ignore */ } }}>
        <span className="nav-caret"><Icon name="chevron" size={12} /></span>
        <span>{label}</span>
        {count != null && <span className="nav-count">{count}</span>}
      </button>
      {open && <div className="nav-section-body">{children}</div>}
    </section>
  );
}

export function Navigator({ onNewChapter }: { onNewChapter: () => void }) {
  const model = useBookStore(s => s.model);
  const location = useBookStore(s => s.location);
  const view = useBookStore(s => s.view);
  const go = useBookStore(s => s.go);
  const openThreads = useBookStore(s => s.openThreads);
  const pending = useBookStore(s => s.pendingSuggestions);
  const visibleChapter = useBookStore(s => s.visibleChapter);
  const selectEntity = useBookStore(s => s.selectEntity);
  const { isOwner } = useAccess();
  const wordsToday = useBookStore(s => s.wordsToday);
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const chapters = useMemo(() => (model?.chapters ?? []).filter(c => !q || c.label.toLowerCase().includes(q)), [model, q]);
  const docs = useMemo(() => (model?.companions ?? []).filter(d => !q || d.title.toLowerCase().includes(q) || d.headings.some(h => h.text.toLowerCase().includes(q))), [model, q]);
  if (!model) return null;

  const current = chapterForPath(model.chapters, location.path);
  const inManuscript = view === "write" && (location.path === "" || !!current);
  const activeNumber = inManuscript ? (visibleChapter ?? current?.number) : undefined;
  const written = model.chapters.filter(c => c.authorPath && !c.started).length;
  const totalWords = model.chapters.reduce((n, c) => n + c.authorWords, 0);
  const badge = (path?: string) => {
    if (!path) return null;
    const n = (openThreads[path] ?? 0) + (pending[path] ?? 0);
    return n ? <span className="nav-badge" title={`${n} open conversation${n === 1 ? "" : "s"}`}>{n}</span> : null;
  };

  let lastPart = "";
  const docRow = (d: CompanionDoc) => {
    const active = view === "write" && location.path === d.path;
    const entities = active ? model.entities.filter(e => e.path === d.path) : [];
    return (
      <div key={d.path}>
        <button className={`nav-item ${active ? "active" : ""}`} onClick={() => go(d.path)} title={d.title}>
          <span className="nav-item-text">{d.title}</span>
          {d.isAsset && <span className="nav-meta">file</span>}
          {badge(d.path)}
        </button>
        {active && (entities.length ? entities : d.headings.filter(h => h.level === 2)).length > 0 && (
          <div className="nav-outline">
            {(entities.length ? entities.map(e => ({ slug: e.slug, text: e.name, id: e.id })) : d.headings.filter(h => h.level === 2).map(h => ({ slug: h.slug, text: h.text, id: "" }))).map(h => (
              <button key={h.slug + h.text} className={`nav-outline-item ${location.anchor === h.slug ? "active" : ""}`} onClick={() => { go(d.path, { anchor: h.slug }); if (h.id) selectEntity(h.id); }}>
                {h.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="navigator" aria-label="Book contents">
      <div className="nav-book">
        <div className="nav-book-title">{model.title}</div>
        {model.author && <div className="nav-book-author">{model.author}</div>}
        <div className="nav-progress" title={`${written} of ${model.chapters.length} chapters written by you`}>
          <div className="nav-progress-bar"><span style={{ width: `${model.chapters.length ? (written / model.chapters.length) * 100 : 0}%` }} /></div>
          <div className="nav-progress-label">{written}/{model.chapters.length} chapters written · {formatWords(totalWords)} words{wordsToday > 0 && <span className="nav-today"> · +{wordsToday.toLocaleString()} today</span>}</div>
        </div>
      </div>
      <div className="nav-search">
        <Icon name="search" size={14} />
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter contents" aria-label="Filter contents" />
        <kbd title="Jump anywhere">⌘K</kbd>
      </div>
      <div className="nav-scroll">
        <Section id="manuscript" label="Manuscript" count={model.chapters.length}>
          <button className={`nav-item nav-title-page ${inManuscript && location.path === "" && !activeNumber ? "active" : ""}`} onClick={() => go("")}>
            <span className="nav-item-text">Title page</span>
          </button>
          {chapters.map(c => {
            const st = chapterState(c);
            const partHeader = c.part && c.part.key !== lastPart ? c.part.title : null;
            if (c.part) lastPart = c.part.key;
            return (
              <div key={c.number}>
                {partHeader && <div className="nav-part">{partHeader}</div>}
                <button className={`nav-item nav-chapter ${activeNumber === c.number ? "active" : ""}`} onClick={() => go(c.authorPath ?? c.referencePath ?? c.currentPath)} title={`${c.label}${c.subtitle ? ` · ${c.subtitle}` : ""} · ${st.label}`}>
                  <span className={`status-dot ${st.key}`} />
                  <span className="nav-num">{c.number}</span>
                  <span className="nav-item-text">{c.title || `Chapter ${c.number}`}</span>
                  {badge(c.authorPath) ?? badge(c.referencePath) ?? <span className="nav-words">{c.authorPath ? formatWords(c.authorWords) : ""}</span>}
                </button>
              </div>
            );
          })}
          {isOwner && !q && <button className="nav-item nav-add" onClick={onNewChapter}><Icon name="plus" size={14} /><span>New chapter</span></button>}
        </Section>
        {GROUPS.map(g => {
          const items = docs.filter(d => d.group === g.id);
          if (g.id === "story") return (
            <Section key={g.id} id={g.id} label={g.label}>
              {(!q || "brief".includes(q)) && <button className={`nav-item ${view === "write" && location.path === "@brief" ? "active" : ""}`} onClick={() => go("@brief")}><span className="nav-item-text">Brief</span></button>}
              {items.map(docRow)}
            </Section>
          );
          if (!items.length) return null;
          return (
            <Section key={g.id} id={g.id} label={g.label} count={g.id === "research" || g.id === "source" ? items.length : undefined} defaultOpen={!["research", "source", "publication"].includes(g.id)}>
              {items.slice(0, g.id === "research" && !q ? 60 : undefined).map(docRow)}
              {g.id === "research" && !q && items.length > 60 && <div className="nav-more">{items.length - 60} more · use the filter</div>}
            </Section>
          );
        })}
      </div>
    </nav>
  );
}
