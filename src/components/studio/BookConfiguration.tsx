import { useEffect, useMemo, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { useProjectStore } from "../../store/useProjectStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { readBookPlacement, saveBookDocument } from "../../lib/supabase-service";
import { BOOK_FORMS, formMeta, readConfig, sameStyle, updateConfig, type BookForm, type ConfigPatch, type HouseStyle } from "../../lib/book-config";
import { BOOKKIT_POLICIES } from "../../lib/bookkit-policies";
import { policy as findPolicy, syncPolicy, verifyPolicy } from "../../lib/policy-blocks";
import { StyleFields } from "./StyleFields";
import { Icon, useAccess } from "./common";

const LANGUAGES = [["en-US", "English (US)"], ["en-GB", "English (UK)"], ["de-DE", "German"], ["fr-FR", "French"], ["es-ES", "Spanish"], ["it-IT", "Italian"], ["nl-NL", "Dutch"]];
const FORMATS = ["docx", "epub", "pdf", "markdown"];

/** The book's configuration: everything book.yaml declares, as a form. */
export function BookConfiguration() {
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const model = useBookStore(s => s.model);
  const project = useProjectStore(s => s.currentProject());
  const renameProject = useProjectStore(s => s.renameProject);
  const updateBrief = useProjectStore(s => s.updateBrief);
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const { isOwner, projectId } = useAccess();
  const yamlFile = files.find(f => f.path === "book.yaml");
  const original = yamlFile?.content ?? "";
  const saved = useMemo(() => readConfig(original), [original]);
  const [patch, setPatch] = useState<ConfigPatch>({});
  const [shelf, setShelf] = useState<{ name: string; style: HouseStyle } | null>(null);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [confirmPolicy, setConfirmPolicy] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    readBookPlacement(projectId).then(p => {
      const s = libraries.flatMap(l => l.shelves).find(x => x.id === p.shelf_id);
      setShelf(s ? { name: s.name, style: (s.style ?? {}) as HouseStyle } : null);
    }).catch(() => setShelf(null));
  }, [projectId, libraries]);

  const view = { ...saved, ...patch, style: patch.style ? { ...saved.style, ...patch.style } : saved.style } as ReturnType<typeof readConfig>;
  const inheriting = view.styleInherit === "shelf";
  const shelfHasStyle = !!shelf && Object.keys(shelf.style).length > 0;
  const shownStyle = inheriting && shelfHasStyle ? shelf!.style : view.style;
  const next = useMemo(() => (Object.keys(patch).length ? updateConfig(original, patch) : original), [original, patch]);
  const dirty = next !== original;
  const policy = findPolicy(view.aiPolicy ?? "");
  const carriers = Object.fromEntries(["README.md", "CLAUDE.md", "AGENTS.md"].map(p => [p, files.find(f => f.path === p)?.content]));
  const problems = policy ? verifyPolicy(carriers, policy) : [];
  const shelfDrift = inheriting && shelfHasStyle && !sameStyle(saved.style, shelf!.style) && !patch.style;
  const change = (p: ConfigPatch) => { setPatch(old => ({ ...old, ...p, style: p.style ? { ...(old.style ?? {}), ...p.style } : old.style })); setState(""); };

  async function save(extra: ConfigPatch = {}) {
    if (!projectId || !yamlFile) return;
    setState("saving"); setError("");
    try {
      const text = updateConfig(original, { ...patch, ...extra });
      upsert({ ...(await saveBookDocument(projectId, "book.yaml", text, yamlFile.version)), loaded: true });
      const declared = readConfig(text).aiPolicy;
      const p = findPolicy(declared ?? "");
      if (p) {
        const writes = syncPolicy(carriers, p, readConfig(text).title);
        for (const [path, content] of Object.entries(writes)) {
          const row = files.find(f => f.path === path);
          upsert({ ...(await saveBookDocument(projectId, path, content, row ? row.version : null)), loaded: true });
        }
      }
      const updatedCfg = readConfig(text);
      const title = updatedCfg.title.trim();
      if (project && title && title !== project.name) renameProject(project.id, title);
      const nextTarget = updatedCfg.targetWords ?? formMeta(updatedCfg.form, updatedCfg.kind).defaultTargetWords;
      if (project && project.brief.targetWordCount !== nextTarget) {
        updateBrief("targetWordCount", nextTarget);
      }
      setPatch({}); setState("saved");
    } catch (e) { setError((e as Error).message); setState(""); }
  }

  if (!yamlFile) return null;
  return (
    <section className="settings-card config-card">
      <div className="config-head">
        <h2>Configuration</h2>
        <span className="muted">Saved in <code>book.yaml</code>, the same file bookkit’s command-line tools read.</span>
      </div>

      <div className="config-group">
        <h3>The book</h3>
        <div className="settings-grid">
          <label className="field">Title<input value={view.title} disabled={!isOwner} onChange={e => change({ title: e.target.value })} /></label>
          <label className="field">Subtitle<input value={view.subtitle} disabled={!isOwner} placeholder="Optional" onChange={e => change({ subtitle: e.target.value })} /></label>
          <label className="field">Author on the cover<input value={view.author} disabled={!isOwner} onChange={e => change({ author: e.target.value })} /></label>
          <label className="field">Published under
            <select value={view.byline} disabled={!isOwner} onChange={e => change({ byline: e.target.value as ConfigPatch["byline"] })}>
              <option value="own-name">My own name</option>
              <option value="pen-name">A pen name</option>
            </select>
          </label>
          <label className="field">Kind
            <select
              value={view.kind}
              disabled={!isOwner}
              onChange={e => {
                const nextKind = e.target.value as ConfigPatch["kind"];
                const nextForm = formMeta(view.form, nextKind).kind === nextKind ? view.form : (nextKind === "nonfiction" ? "nonfiction" : "novel");
                change({ kind: nextKind, form: nextForm });
              }}
            >
              <option value="fiction">Fiction</option>
              <option value="nonfiction">Nonfiction</option>
            </select>
          </label>
          <label className="field">Form / Type
            <select
              value={patch.form ?? (saved.form !== "novel" || original.includes("form:") ? view.form : (model?.form ?? view.form))}
              disabled={!isOwner}
              onChange={e => {
                const nextForm = e.target.value as BookForm;
                const fm = formMeta(nextForm);
                change({ form: nextForm, kind: fm.kind });
              }}
            >
              <optgroup label="Fiction">
                {BOOK_FORMS.filter(f => f.kind === "fiction").map(f => (
                  <option key={f.value} value={f.value}>{f.label} ({f.rangeLabel})</option>
                ))}
              </optgroup>
              <optgroup label="Nonfiction">
                {BOOK_FORMS.filter(f => f.kind === "nonfiction").map(f => (
                  <option key={f.value} value={f.value}>{f.label} ({f.rangeLabel})</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="field">Language
            <select value={view.language} disabled={!isOwner} onChange={e => change({ language: e.target.value })}>
              {[...LANGUAGES, ...(LANGUAGES.some(([code]) => code === view.language) ? [] : [[view.language, view.language]])].map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="field">Book word-count goal
            <input
              type="number"
              min={500}
              step={500}
              disabled={!isOwner}
              value={view.targetWords ?? ""}
              placeholder={String(model?.targetWords ?? formMeta(view.form, view.kind).defaultTargetWords)}
              onChange={e => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                change({ targetWords: raw === "" ? null : Number.isFinite(n) && n > 0 ? Math.round(n) : null });
              }}
            />
          </label>
          <label className="field">Chapter word-count goal
            <input
              type="number"
              min={100}
              step={100}
              disabled={!isOwner}
              value={view.chapterWords ?? ""}
              placeholder={String(model?.chapterTargetWords ?? formMeta(view.form, view.kind).defaultChapterWords)}
              onChange={e => {
                const raw = e.target.value.trim();
                const n = Number(raw);
                change({ chapterWords: raw === "" ? null : Number.isFinite(n) && n > 0 ? Math.round(n) : null });
              }}
            />
          </label>
        </div>
        <p className="settings-hint">
          {(() => {
            const fm = formMeta(patch.form ?? model?.form ?? view.form, view.kind);
            const effBook = view.targetWords ?? model?.targetWords ?? fm.defaultTargetWords;
            const effChap = view.chapterWords ?? model?.chapterTargetWords ?? fm.defaultChapterWords;
            return `${fm.label}: typical range ${fm.rangeLabel}. Current goal: ${effBook.toLocaleString("en-US")} words for the book, ~${effChap.toLocaleString("en-US")} words per chapter (chapters can also set their own draft_budget_words in front matter).`;
          })()}
        </p>
        {view.byline === "pen-name" && <p className="settings-hint">“{view.author || "The author"}” is a pen name: it’s the name on the cover, the title page and the metadata. Nothing bookkit builds prints the person behind it.</p>}
      </div>

      <div className="config-group">
        <h3>AI policy</h3>
        <div className="policy-options">
          {BOOKKIT_POLICIES.map(p => (
            <label key={p.name} className={`policy-option ${view.aiPolicy === p.name ? "on" : ""}`}>
              <input type="radio" name="ai-policy" checked={view.aiPolicy === p.name} disabled={!isOwner}
                onChange={() => { if (p.name !== saved.aiPolicy) setConfirmPolicy(true); change({ aiPolicy: p.name }); }} />
              <span><strong>{p.name}</strong> <span className="muted">v{p.version}</span><br /><span className="policy-summary">{p.summary}</span></span>
            </label>
          ))}
        </div>
        {confirmPolicy && view.aiPolicy !== saved.aiPolicy && <p className="settings-hint warn">Changing the policy changes what any model may do with this book, here and in the book’s repository. Saving rewrites the policy block in README.md, CLAUDE.md and AGENTS.md.</p>}
        {policy && (problems.length
          ? <div className="policy-status warn"><Icon name="flag" size={14} /> The book’s copies of the policy are out of date: {problems.join("; ")}. {isOwner && <button className="link-btn inline" onClick={() => void save()}>Update them</button>}</div>
          : <div className="policy-status"><Icon name="check" size={14} /> README.md, CLAUDE.md{carriers["AGENTS.md"] != null ? " and AGENTS.md" : ""} carry the current {policy.name} block. The assistant follows it too.</div>)}
      </div>

      <div className="config-group">
        <h3>House style</h3>
        {shelf ? (
          <div className="segmented inherit-switch" role="radiogroup" aria-label="Style source">
            <button role="radio" aria-checked={inheriting} className={inheriting ? "on" : ""} disabled={!isOwner} onClick={() => change({ styleInherit: "shelf", style: shelfHasStyle ? shelf.style : undefined })}>Use the {shelf.name} shelf’s style</button>
            <button role="radio" aria-checked={!inheriting} className={!inheriting ? "on" : ""} disabled={!isOwner} onClick={() => change({ styleInherit: "own" })}>This book’s own style</button>
          </div>
        ) : <p className="settings-hint">This book isn’t on a shelf, so it has its own style.</p>}
        {inheriting && !shelfHasStyle && <p className="settings-hint">The {shelf?.name} shelf has no style yet. Set one in Library settings → Shelves.</p>}
        {shelfDrift && <div className="policy-status warn"><Icon name="flag" size={14} /> The {shelf!.name} shelf’s style changed since this book was saved. {isOwner && <button className="link-btn inline" onClick={() => void save({ style: shelf!.style })}>Apply it</button>}</div>}
        <StyleFields value={shownStyle} disabled={!isOwner || inheriting} onChange={style => change({ style })} />
        <p className="settings-hint">Everything a setting can’t say belongs in the style guide page.</p>
      </div>

      <div className="config-group">
        <h3>Manuscript and publishing</h3>
        <div className="settings-grid">
          <label className="field">Chapter heading<input value={view.chapterHeading} disabled={!isOwner} placeholder="Chapter {number_word} — {title}" onChange={e => change({ chapterHeading: e.target.value })} /></label>
          <div className="field">Formats
            <div className="chip-row">
              {FORMATS.map(f => (
                <label key={f} className="check-chip"><input type="checkbox" disabled={!isOwner} checked={view.formats.includes(f)} onChange={e => change({ formats: e.target.checked ? [...view.formats, f] : view.formats.filter(x => x !== f) })} /> {f}</label>
              ))}
            </div>
          </div>
        </div>
        <label className="check-row"><input type="checkbox" disabled={!isOwner} checked={view.titlePage} onChange={e => change({ titlePage: e.target.checked })} /> <span>Title page</span></label>
        <label className="check-row"><input type="checkbox" disabled={!isOwner} checked={view.scenes} onChange={e => change({ scenes: e.target.checked })} /> <span>Chapters are divided into scenes (<code>## Scene N – Title</code>)</span></label>
        <p className="settings-hint">Layout: {view.layout === "parts" ? "chapters grouped in parts" : "one folder of chapters"}.</p>
      </div>

      <div className="config-actions">
        {isOwner && <button className="btn btn-primary btn-sm" disabled={!dirty || state === "saving"} onClick={() => void save()}>{state === "saving" ? "Saving…" : "Save configuration"}</button>}
        {dirty && <button className="btn btn-sm" onClick={() => { setPatch({}); setConfirmPolicy(false); }}>Discard changes</button>}
        {state === "saved" && !dirty && <span className="muted">Saved.</span>}
        <button className="link-btn" onClick={() => setPreview(!preview)}>{preview ? "Hide" : "Show"} book.yaml</button>
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {preview && <pre className="yaml-preview">{next}</pre>}
    </section>
  );
}
