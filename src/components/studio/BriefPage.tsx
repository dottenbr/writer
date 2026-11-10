import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useBookStore } from "../../store/useBookStore";
import { formatWords, Icon, useAccess } from "./common";
import { splitDocument } from "../../lib/markdown-doc";
import { BOOK_FORMS, formMeta, updateConfig, type BookForm, type ConfigPatch } from "../../lib/book-config";
import { saveBookDocument } from "../../lib/supabase-service";

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
  const upsert = useBookStore(s => s.upsert);
  const go = useBookStore(s => s.go);
  const { canEdit, isOwner, projectId } = useAccess();
  const [theme, setTheme] = useState("");
  const brief = project?.brief;
  if (!brief) return <div className="page doc-page"><div className="doc-loading"><span className="spinner" /> Opening…</div></div>;

  const yamlFile = files.find(f => f.path === "book.yaml");
  const patchBookYaml = async (patch: ConfigPatch) => {
    if (!projectId || !yamlFile || !isOwner) return;
    const nextText = updateConfig(yamlFile.content, patch);
    if (nextText === yamlFile.content) return;
    const saved = await saveBookDocument(projectId, "book.yaml", nextText, yamlFile.version);
    upsert({ ...saved, loaded: true });
  };

  const words = model.chapters.reduce((n, c) => n + c.authorWords, 0);
  const draftWords = model.chapters.reduce((n, c) => n + c.referenceWords, 0);
  const target = model.targetWords || brief.targetWordCount || 0;
  const chapterTarget = model.chapterTargetWords || 0;
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
            <div className="panel-label">Form & length</div>
            <div className="brief-length-numbers">
              <strong>{model.formLabel}</strong> · <strong>{formatWords(words)}</strong> of your words
              {target ? <> · book goal <strong>{formatWords(target)}</strong></> : null}
              {chapterTarget ? <span className="muted"> · ~{formatWords(chapterTarget)} / chapter</span> : null}
              {model.hasDraft ? <span className="muted"> · draft {formatWords(draftWords)}</span> : null}
            </div>
          </div>
          <div className="brief-targets">
            <label className="brief-target">Form
              <select
                value={model.form}
                disabled={!canEdit}
                onChange={e => {
                  const nextForm = e.target.value as BookForm;
                  const fm = formMeta(nextForm);
                  const hasCustomTarget = Number(model.config?.manuscript?.target_words) > 0;
                  if (!hasCustomTarget) updateBrief("targetWordCount", fm.defaultTargetWords);
                  void patchBookYaml({ form: nextForm, kind: fm.kind });
                }}
              >
                <optgroup label="Fiction">
                  {BOOK_FORMS.filter(f => f.kind === "fiction").map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Nonfiction">
                  {BOOK_FORMS.filter(f => f.kind === "nonfiction").map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="brief-target">Book goal
              <input
                type="number"
                min={500}
                step={500}
                disabled={!canEdit}
                defaultValue={target || ""}
                key={`book-${target}`}
                placeholder={String(formMeta(model.form, model.kind).defaultTargetWords)}
                onBlur={e => {
                  const raw = e.target.value.trim();
                  const n = raw === "" ? null : Math.max(500, Math.round(Number(raw) || 0));
                  const resolved = n ?? formMeta(model.form, model.kind).defaultTargetWords;
                  if (resolved !== brief.targetWordCount) updateBrief("targetWordCount", resolved);
                  void patchBookYaml({ targetWords: n });
                }}
              />
            </label>
            <label className="brief-target">Chapter goal
              <input
                type="number"
                min={100}
                step={100}
                disabled={!canEdit}
                defaultValue={model.config?.manuscript?.chapter_words ?? chapterTarget ?? ""}
                key={`chap-${model.config?.manuscript?.chapter_words ?? chapterTarget}`}
                placeholder={String(formMeta(model.form, model.kind).defaultChapterWords)}
                onBlur={e => {
                  const raw = e.target.value.trim();
                  const n = raw === "" ? null : Math.max(100, Math.round(Number(raw) || 0));
                  void patchBookYaml({ chapterWords: n });
                }}
              />
            </label>
          </div>
        </div>
        {target > 0 && <div className="brief-bar"><span style={{ width: `${pct}%` }} /></div>}
        {target > 0 && <div className="muted">{pct}% written · about {Math.round(words / 275)} of {Math.round(target / 275)} pages</div>}
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
