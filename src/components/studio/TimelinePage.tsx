import { useMemo, useRef, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { useDocSession } from "./useDocSession";
import { Icon, useAccess } from "./common";
import { addEvent, addPeriod, columns, DEFAULT_HEADER, moveEvent, parseTimeline, removeEvent, renamePeriod, updateEvent, type TimelinePeriod } from "../../lib/timeline";
import { InlineMarkdown } from "./InlineMarkdown";
import { FULL_PAGE } from "../../lib/book-url";
import { CompanionView } from "./CompanionView";

const Cell = InlineMarkdown;

function EventEditor({ header, cells, onSave, onCancel, onDelete, onMove, isNew }: { header: string[]; cells: string[]; onSave: (cells: string[]) => void; onCancel: () => void; onDelete?: () => void; onMove?: (by: -1 | 1) => void; isNew?: boolean }) {
  const [draft, setDraft] = useState(() => header.map((_, i) => cells[i] ?? ""));
  const cols = columns(header);
  return (
    <form className="tl-editor" onSubmit={e => { e.preventDefault(); onSave(draft); }} onKeyDown={e => { if (e.key === "Escape") onCancel(); }}>
      {header.map((h, i) => (
        <label key={i} className={`tl-editor-field ${i === cols.what ? "wide" : ""}`}>
          <span>{h}</span>
          <textarea autoFocus={i === cols.when} rows={i === cols.what ? 3 : 1} value={draft[i]} placeholder={i === cols.when ? "Spring, year 81" : i === cols.what ? "What happens" : ""}
            onChange={e => setDraft(d => d.map((v, j) => (j === i ? e.target.value.replace(/\n/g, " ") : v)))}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || i !== cols.what)) { e.preventDefault(); onSave(draft); } }} />
        </label>
      ))}
      <div className="tl-editor-actions">
        {onMove && <><button type="button" className="btn btn-sm" onClick={() => onMove(-1)}>Move up</button><button type="button" className="btn btn-sm" onClick={() => onMove(1)}>Move down</button></>}
        {onDelete && <button type="button" className="link-btn danger" onClick={onDelete}>Delete</button>}
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={!draft.some(v => v.trim())}>{isNew ? "Add" : "Save"}</button>
      </div>
    </form>
  );
}

function Period({ period, editable, edit, setEdit, apply }: { period: TimelinePeriod; editable: boolean; edit: string | null; setEdit: (k: string | null) => void; apply: (fn: (text: string) => string) => void }) {
  const header = period.hasTable ? period.header : DEFAULT_HEADER;
  const cols = columns(header);
  const [title, setTitle] = useState(period.title);
  return (
    <section className="tl-period" id={period.slug}>
      <div className="tl-period-head">
        <span className="tl-period-dot" />
        {editable
          ? <input className="tl-period-title" value={title} aria-label="Period" onChange={e => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== period.title) apply(t => renamePeriod(t, period.slug, title)); else setTitle(period.title); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          : <h2 className="tl-period-title">{period.title}</h2>}
        <span className="tl-count">{period.events.length}</span>
      </div>
      {period.intro && <p className="tl-period-intro"><Cell text={period.intro.replace(/\n/g, " ")} /></p>}
      <ol className="tl-events">
        {period.events.map((e, i) => {
          const key = `${period.slug}:${i}`;
          const extra = e.cells.map((c, j) => ({ c, h: header[j] })).filter((_, j) => j !== cols.when && j !== cols.what && j !== cols.anchor && _.c);
          return (
            <li key={key} className={`tl-event ${edit === key ? "editing" : ""}`}>
              <div className="tl-when">{e.cells[cols.when]}</div>
              <span className="tl-dot" />
              {edit === key ? (
                <EventEditor header={header} cells={e.cells}
                  onSave={cells => { apply(t => updateEvent(t, period.slug, i, cells)); setEdit(null); }}
                  onCancel={() => setEdit(null)}
                  onDelete={() => { apply(t => removeEvent(t, period.slug, i)); setEdit(null); }}
                  onMove={by => { apply(t => moveEvent(t, period.slug, i, by)); setEdit(`${period.slug}:${i + by}`); }} />
              ) : (
                <div className={`tl-card ${editable ? "editable" : ""}`} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}
                  onClick={ev => { if (editable && !(ev.target as HTMLElement).closest("[data-chapters]")) setEdit(key); }}
                  onKeyDown={ev => { if (editable && ev.key === "Enter") setEdit(key); }}>
                  <div className="tl-when-inline">{e.cells[cols.when]}</div>
                  <div className="tl-what"><Cell text={e.cells[cols.what] ?? ""} /></div>
                  {cols.anchor >= 0 && e.cells[cols.anchor] && <div className="tl-anchor"><Cell text={e.cells[cols.anchor]} /></div>}
                  {extra.map(x => <div key={x.h} className="tl-extra"><span>{x.h}</span> <Cell text={x.c} /></div>)}
                </div>
              )}
            </li>
          );
        })}
        {editable && (edit === `${period.slug}:new` ? (
          <li className="tl-event editing">
            <div className="tl-when" />
            <span className="tl-dot new" />
            <EventEditor isNew header={header} cells={[]} onSave={cells => { apply(t => addEvent(t, period.slug, cells)); setEdit(null); }} onCancel={() => setEdit(null)} />
          </li>
        ) : (
          <li className="tl-event tl-add">
            <div className="tl-when" />
            <span className="tl-dot new" />
            <button className="tl-add-btn" onClick={() => setEdit(`${period.slug}:new`)}><Icon name="plus" size={13} /> Add an event</button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A timeline page drawn as a vertical timeline you can add to. */
export function TimelinePage({ path }: { path: string }) {
  const model = useBookStore(s => s.model)!;
  const go = useBookStore(s => s.go);
  const { projectId, userId, canEdit, suggesting } = useAccess();
  const session = useDocSession(path, { projectId, userId, editable: canEdit, suggesting });
  const textRef = useRef(session.text);
  textRef.current = session.text;
  const timeline = useMemo(() => parseTimeline(session.text), [session.text]);
  const [edit, setEdit] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState<string | null>(null);
  const doc = model.companions.find(d => d.path === path);
  if (session.state === "loading" && !session.text) return <div className="page doc-page"><div className="doc-loading"><span className="spinner" /> Opening…</div></div>;
  if (!timeline.periods.length) return <CompanionView />;
  const editable = canEdit && session.state !== "loading";
  const apply = (fn: (text: string) => string) => session.setText(fn(textRef.current));
  const events = timeline.periods.reduce((n, p) => n + p.events.length, 0);

  return (
    <div className="board timeline-page">
      <header className="board-head">
        <div>
          <div className="doc-eyebrow"><button className="link-btn" onClick={() => go("", { view: "bible" })}>Story bible</button></div>
          <h1>{doc?.title ?? "Timeline"}</h1>
          {timeline.intro && <p className="board-sub"><Cell text={timeline.intro.replace(/\n+/g, " ")} /></p>}
        </div>
        <div className="board-actions">
          <span className="muted tl-total">{timeline.periods.length} periods · {events} events</span>
          <button className="btn btn-sm" onClick={() => go(path, { anchor: FULL_PAGE, view: "bible" })}><Icon name="file" size={14} /> Whole page</button>
        </div>
      </header>
      {session.error && <div className="save-problem" role="alert"><span>Not saved: {session.error}</span><button className="btn btn-sm" onClick={() => void session.saveNow()}>Retry</button></div>}
      <div className="tl">
        {timeline.periods.map(p => <Period key={p.slug} period={p} editable={editable} edit={edit} setEdit={setEdit} apply={apply} />)}
        {editable && (newPeriod == null
          ? <button className="tl-new-period" onClick={() => setNewPeriod("")}><Icon name="plus" size={14} /> Add a period</button>
          : (
            <form className="tl-new-period-form" onSubmit={e => { e.preventDefault(); if (newPeriod.trim()) { apply(t => addPeriod(t, newPeriod)); setNewPeriod(null); } }}>
              <input autoFocus value={newPeriod} onChange={e => setNewPeriod(e.target.value)} placeholder="The second winter" aria-label="Period name" onKeyDown={e => { if (e.key === "Escape") setNewPeriod(null); }} />
              <button className="btn btn-sm btn-primary" disabled={!newPeriod.trim()}>Add period</button>
              <button type="button" className="btn btn-sm" onClick={() => setNewPeriod(null)}>Cancel</button>
            </form>
          ))}
      </div>
      <div className="scene-save muted">{session.state === "saving" ? "Saving…" : session.state === "saved" ? "All changes saved" : ""}</div>
    </div>
  );
}
