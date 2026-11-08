import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useBookStore } from "../../store/useBookStore";
import { formatWords, Icon, useAccess } from "./common";
import { splitDocument } from "../../lib/markdown-doc";

/** A text field that saves when you leave it, not on every keystroke. */
function Field({ label, value, onSave, multiline, placeholder, disabled }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onSave(draft); };
  return (
    <label className="field brief-field">
      {label}
      {multiline
        ? <textarea value={draft} disabled={disabled} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={commit} rows={3} />
        : <input value={draft} disabled={disabled} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
    </label>
  );
}

export function BriefPage() {
  const project = useProjectStore(s => s.currentProject());
  const updateBrief = useProjectStore(s => s.updateBrief);
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const { canEdit } = useAccess();
  const [theme, setTheme] = useState("");
  const brief = project?.brief;
  if (!brief) return <div className="page doc-page"><div className="doc-loading"><span className="spinner" /> Opening…</div></div>;

  const words = model.chapters.reduce((n, c) => n + c.authorWords, 0);
  const draftWords = model.chapters.reduce((n, c) => n + c.referenceWords, 0);
  const target = brief.targetWordCount || 0;
  const pct = target ? Math.min(100, Math.round((words / target) * 100)) : 0;
  const onePage = files.find(f => f.path === "bible/book-on-one-page.md");
  const synopsis = onePage ? splitDocument(onePage.content).body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith("#")) ?? "" : "";
  const themes = brief.themes ?? [];

  return (
    <div className="page doc-page brief-page">
      <div className="doc-head">
        <div className="doc-eyebrow"><span>Story</span></div>
        <h1 className="doc-title">Brief</h1>
        <p className="brief-lede">What this book is, who it’s for and how long it should be. The synopsis and the shape of the story live on <button className="link-btn inline" onClick={() => go("bible/book-on-one-page.md")}>the book on one page</button>.</p>
      </div>

      <section className="brief-hero">
        <div className="brief-hero-title">{model.title}</div>
        {model.author && <div className="brief-hero-author">{model.author}</div>}
        {brief.logline && <p className="brief-hero-logline">{brief.logline}</p>}
      </section>

      <section className="brief-grid">
        <Field label="Logline" multiline disabled={!canEdit} value={brief.logline} placeholder="The book in one or two sentences: who wants what, and what stands in the way." onSave={v => updateBrief("logline", v)} />
        <div className="brief-two">
          <Field label="Genre" disabled={!canEdit} value={brief.genre} placeholder="Literary thriller" onSave={v => updateBrief("genre", v)} />
          <Field label="Readers" disabled={!canEdit} value={brief.audience} placeholder="Who will love this book" onSave={v => updateBrief("audience", v)} />
        </div>
        <Field label="Comparable titles" disabled={!canEdit} value={brief.comparableTitles} placeholder="Two or three books it sits beside on a shelf" onSave={v => updateBrief("comparableTitles", v)} />
        <div className="field brief-field">
          Themes
          <div className="chip-row themes">
            {themes.map(t => (
              <span key={t} className="theme-chip">{t}{canEdit && <button aria-label={`Remove ${t}`} onClick={() => updateBrief("themes", themes.filter(x => x !== t))}><Icon name="close" size={11} /></button>}</span>
            ))}
            {canEdit && <input className="theme-input" value={theme} placeholder="Add a theme…" onChange={e => setTheme(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && theme.trim()) { updateBrief("themes", [...new Set([...themes, theme.trim()])]); setTheme(""); } }} />}
          </div>
        </div>
      </section>

      <section className="brief-length">
        <div className="brief-length-head">
          <div>
            <div className="panel-label">Length</div>
            <div className="brief-length-numbers"><strong>{formatWords(words)}</strong> of your words{target ? <> · target <strong>{formatWords(target)}</strong></> : null}{model.hasDraft ? <span className="muted"> · draft {formatWords(draftWords)}</span> : null}</div>
          </div>
          <label className="brief-target">Target words
            <input type="number" min={0} step={1000} disabled={!canEdit} defaultValue={target || ""} key={target} placeholder="80000" onBlur={e => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); if (n !== target) updateBrief("targetWordCount", n); }} />
          </label>
        </div>
        {target > 0 && <div className="brief-bar"><span style={{ width: `${pct}%` }} /></div>}
        {target > 0 && <div className="muted">{pct}% written · about {Math.round(words / 300)} of {Math.round(target / 300)} pages</div>}
      </section>

      {synopsis && (
        <section className="brief-synopsis">
          <div className="panel-label-row"><span className="panel-label">Synopsis</span><button className="link-btn" onClick={() => go("bible/book-on-one-page.md")}>Edit on the one-page summary</button></div>
          <p>{synopsis.replace(/[*_]/g, "")}</p>
        </section>
      )}

      <Field label="Notes" multiline disabled={!canEdit} value={brief.notes} placeholder="Anything else: the promise to the reader, what to avoid, deadlines." onSave={v => updateBrief("notes", v)} />
    </div>
  );
}
