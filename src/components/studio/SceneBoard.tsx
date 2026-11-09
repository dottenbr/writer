import { useEffect, useMemo, useRef, useState } from "react";
import { useDocSession } from "./useDocSession";
import { Icon, useAccess } from "./common";
import { addScene, deleteScene, moveScene, parseScenes, SCENE_FIELDS, updateScene, type SceneCard, type SceneField } from "../../lib/scene-cards";
import type { ChapterInfo } from "../../lib/book-model";
import { InlineMarkdown } from "./InlineMarkdown";

/** A textarea that grows with its text. */
function Grow({ value, onChange, placeholder, className, onBlur, onKeyDown, label, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onBlur?: () => void; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; label: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.focus();
    const end = ref.current.value.length;
    ref.current.setSelectionRange(end, end);
  }, [autoFocus]);
  return (
    <textarea ref={ref} rows={1} aria-label={label} className={className} value={value} placeholder={placeholder} onBlur={onBlur}
      onChange={e => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={e => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }} />
  );
}

/** Shows formatted text; click to edit the words underneath. */
function EditableText({ value, onChange, label, placeholder, editable, className, editing, setEditing, onKeyDown }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string; editable: boolean; className?: string;
  editing: boolean; setEditing: (on: boolean) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  if (editable && editing) return <Grow autoFocus label={label} className={`scene-input ${className ?? ""}`} value={value} onChange={onChange} onBlur={() => setEditing(false)} onKeyDown={onKeyDown} placeholder={placeholder} />;
  return (
    <div className={`scene-text ${className ?? ""} ${editable ? "editable" : ""} ${value ? "" : "empty"}`} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? `Edit ${label}` : undefined}
      onClick={e => { if (editable && !(e.target as HTMLElement).closest("[data-chapters]")) setEditing(true); }}
      onKeyDown={e => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEditing(true); } }}>
      {value ? <InlineMarkdown text={value} /> : <span className="scene-placeholder">{editable ? placeholder : ""}</span>}
    </div>
  );
}

/** One row per beat. Enter starts the next beat; Backspace on an empty beat removes it. */
function Beats({ items, editable, label, onChange }: { items: string[]; editable: boolean; label: string; onChange: (items: string[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <ul className="scene-beats">
      {items.map((it, k) => (
        <li key={k}>
          <EditableText value={it} label={`${label}, beat ${k + 1}`} editable={editable} placeholder="A beat"
            editing={editing === k} setEditing={on => { setEditing(on ? k : null); if (!on && !it.trim()) onChange(items.filter((_, j) => j !== k)); }}
            onChange={v => onChange(items.map((x, j) => (j === k ? v : x)))}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); onChange([...items.slice(0, k + 1), "", ...items.slice(k + 1)]); setEditing(k + 1); }
              else if (e.key === "Backspace" && !it) { e.preventDefault(); onChange(items.filter((_, j) => j !== k)); setEditing(k > 0 ? k - 1 : null); }
            }} />
        </li>
      ))}
      {editable && <li className="scene-beat-add"><button className="link-btn" onClick={() => { onChange([...items, ""]); setEditing(items.length); }}><Icon name="plus" size={11} /> Add a beat</button></li>}
    </ul>
  );
}

function SceneCardView({ card, index, count, editable, focused, onChange, onMove, onDelete }: {
  card: SceneCard; index: number; count: number; editable: boolean; focused: boolean;
  onChange: (next: { title?: string; fields?: SceneField[] }) => void; onMove: (by: -1 | 1) => void; onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focused]);
  const setField = (i: number, patch: Partial<SceneField>) => onChange({ fields: card.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const missing = SCENE_FIELDS.filter(l => !card.fields.some(f => f.label.toLowerCase() === l.toLowerCase()));
  return (
    <article ref={ref} className={`scene-card ${focused ? "focused" : ""}`} id={card.slug}>
      <header className="scene-card-head">
        <span className="scene-num">{card.number ?? index + 1}</span>
        {editable
          ? <Grow label="Scene title" className="scene-title-input" value={card.title} onChange={title => onChange({ title })} placeholder="Scene title" />
          : <h3 className="scene-title">{card.title}</h3>}
        {editable && (
          <div className="scene-actions">
            <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move scene up" title="Move up"><Icon name="down" size={14} /></button>
            <button className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move scene down" title="Move down"><Icon name="down" size={14} /></button>
            {confirm
              ? <span className="confirm-inline"><button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button><button className="btn btn-sm" onClick={() => setConfirm(false)}>Keep</button></span>
              : <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Delete scene" title="Delete scene"><Icon name="close" size={14} /></button>}
          </div>
        )}
      </header>
      <dl className="scene-fields">
        {card.fields.map((f, i) => (
          <div key={f.label + i} className={`scene-field ${/purpose|turn|ends on/i.test(f.label) ? "key" : ""}`}>
            <dt>{f.label}</dt>
            <dd>
              {(f.value || !f.items.length || editing === `v${i}`) && (
                <EditableText value={f.value} label={f.label} editable={editable} placeholder={`Add ${f.label.toLowerCase()}`} editing={editing === `v${i}`} setEditing={on => setEditing(on ? `v${i}` : null)} onChange={value => setField(i, { value })} />
              )}
              {(f.items.length > 0 || (editable && /what happens|beats/i.test(f.label))) && (
                <Beats items={f.items} editable={editable} label={f.label} onChange={items => setField(i, { items })} />
              )}
            </dd>
          </div>
        ))}
      </dl>
      {card.extra && <p className="scene-extra">{card.extra}</p>}
      {editable && missing.length > 0 && (
        adding
          ? <div className="scene-add-field">{missing.map(l => <button key={l} className="chip" onClick={() => { onChange({ fields: [...card.fields, { label: l, value: "", items: [] }] }); setAdding(false); }}>{l}</button>)}<button className="link-btn" onClick={() => setAdding(false)}>Cancel</button></div>
          : <button className="link-btn scene-add-btn" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> Add a field</button>
      )}
    </article>
  );
}

export function SceneCards({ path, chapter, anchor }: { path: string; chapter?: ChapterInfo; anchor?: string }) {
  const { projectId, userId, canEdit, suggesting } = useAccess();
  const session = useDocSession(path, { projectId, userId, editable: canEdit, suggesting });
  const textRef = useRef(session.text);
  textRef.current = session.text;
  const cards = useMemo(() => parseScenes(session.text), [session.text]);
  const [focus, setFocus] = useState(anchor);
  useEffect(() => setFocus(anchor), [anchor]);
  if (session.state === "loading" && !session.text) return <div className="doc-loading"><span className="spinner" /> Opening…</div>;
  const editable = canEdit && session.state !== "loading";
  const add = () => {
    const next = addScene(textRef.current, "New scene");
    session.setText(next.text);
    setFocus(next.slug);
  };
  return (
    <>
      {session.error && <div className="save-problem" role="alert"><span>Not saved: {session.error}</span><button className="btn btn-sm" onClick={() => void session.saveNow()}>Retry</button></div>}
      <div className="scene-list">
        {cards.map((card, i) => (
          <SceneCardView key={i} card={card} index={i} count={cards.length} editable={editable} focused={focus === card.slug}
            onChange={next => {
              const current = parseScenes(textRef.current).find(c => c.slug === card.slug) ?? card;
              const out = updateScene(textRef.current, current, next);
              session.setText(out.text);
            }}
            onMove={by => session.setText(moveScene(textRef.current, card.slug, by))}
            onDelete={() => session.setText(deleteScene(textRef.current, card.slug))}
          />
        ))}
        {!cards.length && <div className="empty-board"><p>No scene cards yet.</p></div>}
        {editable && <button className="scene-new" onClick={add}><Icon name="plus" size={16} /> Add a scene</button>}
      </div>
      <div className="scene-save muted">{session.state === "saving" ? "Saving…" : session.state === "dirty" ? "Unsaved changes" : session.state === "saved" ? "All changes saved" : ""}</div>
    </>
  );
}
