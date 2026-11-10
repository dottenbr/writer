import { useEffect, useMemo, useRef, useState } from "react";
import { prefs, useBookStore, writePrefs } from "../../store/useBookStore";
import { saveBookDocument } from "../../lib/supabase-service";
import { readBookReview, saveSuggestion, type Suggestion } from "../../lib/bookkit-collaboration";
import { parseScenes, SCENE_FIELDS, updateScene, type SceneField } from "../../lib/scene-cards";
import { InlineMarkdown } from "./InlineMarkdown";
import { Icon, useAccess } from "./common";

/** Text you click to edit; it saves when you leave it. */
function Field({ value, label, editable, placeholder, onCommit, onEnter, autoFocus, onBackspaceEmpty }: {
  value: string; label: string; editable: boolean; placeholder?: string; onCommit: (v: string) => void;
  onEnter?: () => void; autoFocus?: boolean; onBackspaceEmpty?: () => void;
}) {
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draft, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); const n = ref.current.value.length; ref.current.setSelectionRange(n, n); } }, [editing]);
  if (editable && editing) {
    return (
      <textarea ref={ref} rows={1} className="scene-input" aria-label={label} value={draft} placeholder={placeholder}
        onChange={e => setDraft(e.target.value.replace(/\n/g, " "))}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); if (onEnter) { if (draft !== value) onCommit(draft); onEnter(); setEditing(false); } else (e.target as HTMLTextAreaElement).blur(); }
          else if (e.key === "Escape") { setDraft(value); setEditing(false); }
          else if (e.key === "Backspace" && !draft && onBackspaceEmpty) { e.preventDefault(); onBackspaceEmpty(); }
        }} />
    );
  }
  return (
    <div className={`scene-text ${editable ? "editable" : ""}`} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined} aria-label={editable ? `Edit ${label}` : undefined}
      onClick={e => { if (editable && !(e.target as HTMLElement).closest("[data-chapters]")) setEditing(true); }}
      onKeyDown={e => { if (editable && e.key === "Enter") { e.preventDefault(); setEditing(true); } }}>
      {value ? <InlineMarkdown text={value} /> : <span className="scene-placeholder">{editable ? placeholder : ""}</span>}
    </div>
  );
}

/**
 * One scene card at the top of its scene in the chapter. Collapsed it shows the
 * scene's number, title and purpose; expanded, every field, editable in place.
 */
export function SceneCardInline({ path, index, waiting, onBegin }: { path: string; index: number; waiting?: boolean; onBegin?: () => void }) {
  const file = useBookStore(s => s.files.find(f => f.path === path));
  const upsert = useBookStore(s => s.upsert);
  const go = useBookStore(s => s.go);
  const { canEdit, suggesting, projectId, userId } = useAccess();
  const [suggestedText, setSuggestedText] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<Suggestion | undefined>();
  const [prevContent, setPrevContent] = useState<string | null>(null);
  const sourceContent = suggestedText ?? file?.content ?? "";
  const cards = useMemo(() => (sourceContent ? parseScenes(sourceContent) : []), [sourceContent]);
  const card = cards[index];
  const key = `sceneOpen:${path}#${index}`;
  const [open, setOpen] = useState<boolean>(() => !!prefs()[key]);
  const [newBeat, setNewBeat] = useState<number | null>(null);
  const [state, setState] = useState<"" | "saving" | "saved" | "suggested" | "error">("");

  useEffect(() => {
    if (!open || !suggesting || !projectId) return;
    let active = true;
    readBookReview(projectId, path).then(r => {
      if (!active) return;
      const mine = r.suggestions.find(s => s.author_id === userId && s.status === "pending");
      if (mine) {
        setPendingSuggestion(mine);
        setSuggestedText(mine.proposed_content);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [open, suggesting, projectId, path, userId]);

  if (!card) return null;

  const toggle = () => { setOpen(!open); writePrefs({ [key]: !open }); };
  const purpose = (card.fields.find(f => /purpose/i.test(f.label))?.value ?? "").replace(/[*_]/g, "");
  const commit = async (next: { title?: string; fields?: SceneField[] }) => {
    const latest = useBookStore.getState().files.find(f => f.path === path);
    if (!latest || !projectId || !canEdit) return;
    const baseText = suggestedText ?? latest.content;
    const current = parseScenes(baseText)[index];
    if (!current) return;
    const out = updateScene(baseText, current, next);
    if (out.text === baseText) return;
    setState("saving");
    try {
      setPrevContent(baseText);
      if (suggesting) {
        const res = await saveSuggestion(projectId, latest, out.text, pendingSuggestion);
        setPendingSuggestion(res);
        setSuggestedText(out.text);
        setState("suggested");
      } else {
        upsert({ ...(await saveBookDocument(projectId, path, out.text, latest.version)), loaded: true });
        setState("saved");
      }
    } catch { setState("error"); }
  };
  const undoLast = async () => {
    const latest = useBookStore.getState().files.find(f => f.path === path);
    if (!latest || !projectId || !prevContent) return;
    setState("saving");
    try {
      if (suggesting) {
        const res = await saveSuggestion(projectId, latest, prevContent, pendingSuggestion);
        setPendingSuggestion(res);
        setSuggestedText(prevContent);
      } else {
        upsert({ ...(await saveBookDocument(projectId, path, prevContent, latest.version)), loaded: true });
      }
      setPrevContent(null);
      setState("");
    } catch { setState("error"); }
  };
  const setField = (i: number, patch: Partial<SceneField>) => void commit({ fields: card.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const missing = SCENE_FIELDS.filter(l => !card.fields.some(f => f.label.toLowerCase() === l.toLowerCase()));

  return (
    <div className={`scene-inline ${open ? "open" : ""} ${waiting ? "waiting" : ""}`}>
      <button className="scene-inline-head" onClick={toggle} aria-expanded={open}>
        <span className="scene-num">{card.number ?? index + 1}</span>
        <span className="scene-inline-title">{card.title}</span>
        {!open && purpose && <span className="scene-inline-purpose">{purpose}</span>}
        {waiting && <span className="scene-inline-waiting">not started</span>}
        <span className="scene-inline-chevron"><Icon name={open ? "down" : "chevron"} size={14} /></span>
      </button>
      {open && (
        <div className="scene-inline-body">
          {canEdit && <div className="scene-inline-row"><span className="scene-inline-label">Title</span><Field value={card.title} label="Scene title" editable onCommit={title => void commit({ title })} /></div>}
          <dl className="scene-fields">
            {card.fields.map((f, i) => (
              <div key={f.label + i} className={`scene-field ${/purpose|turn|ends on/i.test(f.label) ? "key" : ""}`}>
                <dt>{f.label}</dt>
                <dd>
                  {(f.value || !f.items.length) && <Field value={f.value} label={f.label} editable={canEdit} placeholder={`Add ${f.label.toLowerCase()}`} onCommit={value => setField(i, { value })} />}
                  {(f.items.length > 0 || (canEdit && /what happens|beats/i.test(f.label))) && (
                    <ul className="scene-beats">
                      {f.items.map((it, k) => (
                        <li key={k}>
                          <Field value={it} label={`${f.label}, beat ${k + 1}`} editable={canEdit} placeholder="A beat" autoFocus={newBeat === k && i === card.fields.findIndex(x => /what happens|beats/i.test(x.label))}
                            onCommit={v => setField(i, { items: v.trim() ? f.items.map((x, j) => (j === k ? v : x)) : f.items.filter((_, j) => j !== k) })}
                            onEnter={() => { setNewBeat(k + 1); setField(i, { items: [...f.items.slice(0, k + 1), "", ...f.items.slice(k + 1)] }); }}
                            onBackspaceEmpty={() => setField(i, { items: f.items.filter((_, j) => j !== k) })} />
                        </li>
                      ))}
                      {canEdit && <li className="scene-beat-add"><button className="link-btn" onClick={() => { setNewBeat(f.items.length); setField(i, { items: [...f.items, ""] }); }}><Icon name="plus" size={11} /> Add a beat</button></li>}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {card.extra && <p className="scene-extra">{card.extra}</p>}
          <div className="scene-inline-foot">
            {canEdit && missing.length > 0 && (
              <select className="scene-add-select" value="" aria-label="Add a field" onChange={e => { if (e.target.value) void commit({ fields: [...card.fields, { label: e.target.value, value: "", items: [] }] }); }}>
                <option value="">+ Add a field</option>
                {missing.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            <span className="muted">
              {state === "saving" ? "Saving…" : state === "suggested" ? "Suggested for the author" : state === "saved" ? "Saved" : state === "error" ? "Not saved. Reload and try again." : ""}
            </span>
            {prevContent && state !== "saving" && <button className="link-btn" onClick={() => void undoLast()}>Undo</button>}
            {onBegin && <button className="btn btn-sm" onClick={onBegin}>Begin this scene</button>}
            <button className="link-btn" onClick={() => go(path, { view: "plan", anchor: card.slug })}>All scene cards</button>
          </div>
        </div>
      )}
    </div>
  );
}
