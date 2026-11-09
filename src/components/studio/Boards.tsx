import { Fragment, useMemo, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { chapterState, formatWords, Icon, KIND_LABEL } from "./common";
import { entityKindForPath, sections, type Entity, type EntityKind } from "../../lib/book-model";
import { EntityTile, KIND_ORDER, KIND_PLURAL, useAppearances } from "./BiblePages";
import { PlanList } from "./PlanList";
import { prefs, writePrefs } from "../../store/useBookStore";
import { splitDocument } from "../../lib/markdown-doc";

export function PlanBoard() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const openThreads = useBookStore(s => s.openThreads);
  const [filter, setFilter] = useState<"all" | "written" | "progress" | "draft">("all");
  const [layout, setLayoutState] = useState<"cards" | "list">(() => prefs().planLayout ?? "cards");
  const setLayout = (l: "cards" | "list") => { setLayoutState(l); writePrefs({ planLayout: l }); };
  const counts = useMemo(() => {
    const c = { written: 0, progress: 0, draft: 0 };
    model.chapters.forEach(ch => { c[chapterState(ch).key]++; });
    return c;
  }, [model]);
  const questions = useMemo(() => {
    const f = files.find(x => x.path === "outline/open-questions.md");
    return f ? sections(splitDocument(f.content).body, 2).length : 0;
  }, [files]);
  const chapters = model.chapters.filter(c => filter === "all" || chapterState(c).key === filter);
  let lastPart = "";
  return (
    <div className="board">
      <header className="board-head">
        <div>
          <h1>Plan</h1>
          <p className="board-sub">Every chapter at a glance: its purpose, its scenes and where your writing stands.</p>
        </div>
        <div className="board-links">
          {model.companions.some(d => d.path === "outline/chapters.md") && <button className="btn btn-sm" onClick={() => go("outline/chapters.md")}>Chapter outline</button>}
          {model.companions.some(d => d.path === "outline/arcs.md") && <button className="btn btn-sm" onClick={() => go("outline/arcs.md")}>Arcs</button>}
          {model.companions.some(d => d.path === "outline/open-questions.md") && <button className="btn btn-sm" onClick={() => go("outline/open-questions.md")}>Open questions{questions ? ` · ${questions}` : ""}</button>}
        </div>
      </header>
      <div className="plan-toolbar">
      <div className="segmented" role="tablist" aria-label="Layout">
        <button role="tab" aria-selected={layout === "cards"} className={layout === "cards" ? "on" : ""} onClick={() => setLayout("cards")}><Icon name="grid" size={13} /> Cards</button>
        <button role="tab" aria-selected={layout === "list"} className={layout === "list" ? "on" : ""} onClick={() => setLayout("list")}><Icon name="bullets" size={13} /> List</button>
      </div>
      {layout === "cards" && <div className="segmented" role="tablist">
        {([["all", "All", model.chapters.length], ["written", "Written", counts.written], ["progress", "In progress", counts.progress], ["draft", model.hasDraft ? "Draft only" : "Not started", counts.draft]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label} <span>{n}</span></button>
        ))}
      </div>}
      </div>
      {layout === "list" ? <PlanList /> : <div className="card-grid">
        {chapters.map(c => {
          const st = chapterState(c);
          const part = c.part && c.part.key !== lastPart ? c.part.title : null;
          if (c.part) lastPart = c.part.key;
          const comments = (openThreads[c.authorPath ?? ""] ?? 0) + (openThreads[c.referencePath ?? ""] ?? 0);
          return (
            <Fragment key={c.number}>
              {part && <div className="grid-part">{part}</div>}
              <button className={`plan-card ${st.key}`} onClick={() => go(c.authorPath ?? c.currentPath)}>
                <div className="plan-card-top">
                  <span className="plan-num">{c.number}</span>
                  <span className={`chapter-state ${st.key}`}>{st.label}</span>
                </div>
                <div className="plan-title">{c.title || `Chapter ${c.number}`}</div>
                {c.purpose ? <p className="plan-purpose">{c.purpose.replace(/[*_]/g, "")}</p> : <p className="plan-purpose muted">No purpose in the outline yet.</p>}
                {c.sceneTitles.length > 0 && (
                  <ol className="plan-scenes">
                    {c.sceneTitles.slice(0, 4).map((t, i) => <li key={i}>{t.replace(/^Scene\s+\d+\s*[–—-]\s*/i, "")}</li>)}
                    {c.sceneTitles.length > 4 && <li className="muted">+{c.sceneTitles.length - 4} more</li>}
                  </ol>
                )}
                <div className="plan-foot">
                  <span>{c.authorPath ? `${formatWords(c.authorWords)} words` : c.referenceWords ? `${formatWords(c.referenceWords)} draft words` : "Empty"}</span>
                  {comments > 0 && <span className="plan-comments"><Icon name="comment" size={12} /> {comments}</span>}
                </div>
              </button>
            </Fragment>
          );
        })}
      </div>}
    </div>
  );
}

export function BibleBoard() {
  const model = useBookStore(s => s.model)!;
  const go = useBookStore(s => s.go);
  const appearances = useAppearances();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntityKind | "all">("all");
  const reference = model.companions.filter(d => (d.group === "story" || d.group === "bible") && !entityKindForPath(d.path));
  const kinds = KIND_ORDER.filter(k => model.entities.some(e => e.kind === k));
  const filtered = model.entities.filter(e => kind === "all" || e.kind === kind).filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase()) || e.markdown.toLowerCase().includes(q.toLowerCase()));
  const open = (e: Entity) => go(e.path, { anchor: e.slug, view: "bible" });
  return (
    <div className="board">
      <header className="board-head">
        <div>
          <h1>Story bible</h1>
          <p className="board-sub">The people, places and facts of the book. Names you write are linked to these entries automatically.</p>
        </div>
        <div className="board-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the bible" aria-label="Search the bible" /></div>
      </header>
      {kinds.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Kind">
          <button role="tab" aria-selected={kind === "all"} className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All <span>{model.entities.length}</span></button>
          {kinds.map(k => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND_PLURAL[k]} <span>{model.entities.filter(e => e.kind === k).length}</span></button>)}
        </div>
      )}
      {reference.length > 0 && !q && kind === "all" && (
        <div className="ref-docs">
          {reference.map(d => (
            <button key={d.path} className="ref-doc" onClick={() => go(d.path)}>
              <Icon name={d.group === "story" ? "book" : "file"} size={16} />
              <span>{d.title}</span>
            </button>
          ))}
        </div>
      )}
      {[...new Set([...(q || kind !== "all" ? [] : model.companions.filter(d => entityKindForPath(d.path)).map(d => d.path)), ...filtered.map(e => e.path)])].map(path => {
        const list = filtered.filter(e => e.path === path);
        const title = model.companions.find(d => d.path === path)?.title ?? KIND_PLURAL[list[0]?.kind ?? "entry"];
        if (!list.length) return (
          <section key={path} className="bible-section">
            <h2><button className="bible-section-link" onClick={() => go(path, { view: "bible" })}>{title} <span>0</span><Icon name="chevron" size={13} /></button></h2>
            <button className="entity-tile empty-tile" onClick={() => go(path, { view: "bible" })}><Icon name="plus" size={16} /> Add the first {KIND_LABEL[entityKindForPath(path) ?? "entry"].toLowerCase()}</button>
          </section>
        );
        return (
          <section key={path} className="bible-section">
            <h2><button className="bible-section-link" onClick={() => go(path, { view: "bible" })}>{title} <span>{list.length}</span><Icon name="chevron" size={13} /></button></h2>
            <div className="card-grid entity-grid">
              {list.map(e => <EntityTile key={e.id} entity={e} chapters={appearances.get(e.id)} onOpen={() => open(e)} />)}
            </div>
          </section>
        );
      })}
      {model.entities.length === 0 && !model.companions.some(d => entityKindForPath(d.path)) && (
        <div className="empty-board">
          <p>No bible entries yet. Add <strong>## Name</strong> sections to the characters or places pages and they appear here.</p>
        </div>
      )}
    </div>
  );
}
