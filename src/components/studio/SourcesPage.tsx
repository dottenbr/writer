import { useEffect, useMemo, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { saveBookDocument } from "../../lib/supabase-service";
import { citedKeys, definesSource, fullCite, makeKey, NEW_BIBLIOGRAPHY, personName, removeSource, shortCite, SOURCE_TYPES, upsertSource, withBibliography, year, type Person, type Source } from "../../lib/bibliography";
import { Icon, useAccess } from "./common";
import { useSources } from "./useSources";

type Draft = {
  id: string; type: string; title: string; authors: string; editors: string; container: string; publisher: string; place: string;
  year: string; volume: string; page: string; url: string; note: string;
};

const people = (list?: Person[]) => (list ?? []).map(p => (p.literal ? p.literal : [p.family, p.given].filter(Boolean).join(", "))).join("; ");
const parsePeople = (text: string): Person[] => text.split(";").map(s => s.trim()).filter(Boolean).map(s => {
  const [family, given] = s.split(",").map(x => x.trim());
  return given ? { family, given } : s.includes(" ") ? { family: s.split(" ").pop()!, given: s.split(" ").slice(0, -1).join(" ") } : { literal: s };
});

function toDraft(s?: Source): Draft {
  return {
    id: s?.id ?? "", type: s?.type ?? "book", title: s?.title ?? "", authors: people(s?.author), editors: people(s?.editor),
    container: String(s?.["container-title"] ?? ""), publisher: String(s?.publisher ?? ""), place: String(s?.["publisher-place"] ?? ""),
    year: s ? year(s) : "", volume: String(s?.volume ?? ""), page: String(s?.page ?? ""), url: String(s?.URL ?? ""), note: String(s?.note ?? ""),
  };
}

function fromDraft(d: Draft, base?: Source): Source {
  const issued = d.year.trim() ? (/^\d{3,4}$/.test(d.year.trim()) ? { "date-parts": [[Number(d.year.trim())]] } : { literal: d.year.trim() }) : undefined;
  return {
    ...(base ?? {}),
    id: d.id.trim(), type: d.type, title: d.title.trim() || undefined,
    author: parsePeople(d.authors), editor: parsePeople(d.editors),
    "container-title": d.container.trim() || undefined, publisher: d.publisher.trim() || undefined, "publisher-place": d.place.trim() || undefined,
    issued, volume: d.volume.trim() || undefined, page: d.page.trim() || undefined, URL: d.url.trim() || undefined, note: d.note.trim() || undefined,
  } as Source;
}

function SourceForm({ initial, taken, onSave, onCancel, onDelete, citedCount }: { initial?: Source; taken: Set<string>; onSave: (s: Source, previousId?: string) => Promise<void>; onCancel: () => void; onDelete?: () => Promise<void>; citedCount: number }) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const idTaken = d.id.trim() !== (initial?.id ?? "") && taken.has(d.id.trim());
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const draft = { ...d, id: d.id.trim() || makeKey(fromDraft({ ...d, id: "x" }), taken) };
    if (!/^[\w][\w:.#$%&+?<>~/-]*$/.test(draft.id)) { setError("The key may use letters, digits and - _ : . only."); return; }
    setBusy(true); setError("");
    try { await onSave(fromDraft(draft, initial), initial?.id); } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  const container = ["chapter", "article-journal", "article-newspaper", "article-magazine", "entry-dictionary", "entry-encyclopedia", "webpage"].includes(d.type);
  return (
    <form className="src-form" onSubmit={save}>
      <div className="settings-grid">
        <label className="field">Type<select value={d.type} onChange={set("type")}>{SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="field">Key <span className="muted">(how the text cites it)</span><input value={d.id} onChange={set("id")} placeholder="made from author and year" aria-invalid={idTaken} /></label>
      </div>
      <label className="field">Title<input value={d.title} onChange={set("title")} autoFocus={!initial} /></label>
      <div className="settings-grid">
        <label className="field">Authors <span className="muted">(Family, Given; …)</span><input value={d.authors} onChange={set("authors")} placeholder="Luther, Martin" /></label>
        <label className="field">Editors / translators<input value={d.editors} onChange={set("editors")} /></label>
      </div>
      {container && <label className="field">{d.type === "webpage" ? "Website" : d.type === "chapter" ? "Book" : "Journal or paper"}<input value={d.container} onChange={set("container")} /></label>}
      <div className="settings-grid">
        <label className="field">Publisher<input value={d.publisher} onChange={set("publisher")} /></label>
        <label className="field">Place<input value={d.place} onChange={set("place")} /></label>
      </div>
      <div className="settings-grid">
        <label className="field">Year<input value={d.year} onChange={set("year")} inputMode="numeric" /></label>
        <label className="field">Volume / pages<input value={[d.volume, d.page].filter(Boolean).join(" · ")} onChange={e => { const [v, p] = e.target.value.split("·").map(x => x.trim()); setD({ ...d, volume: p !== undefined ? v : "", page: p ?? v }); }} placeholder="pages, or volume · pages" /></label>
      </div>
      <label className="field">Link<input value={d.url} onChange={set("url")} placeholder="https://" /></label>
      <label className="field">Note <span className="muted">(where you read it, what it is good for)</span><textarea className="field-input src-note" value={d.note} onChange={set("note")} rows={2} /></label>
      {idTaken && <div className="inline-error">Another source already has the key @{d.id.trim()}.</div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="src-form-actions">
        {onDelete && (confirm
          ? <span className="confirm-inline">{citedCount > 0 && <span className="muted">Cited {citedCount}× in the book. </span>}<button type="button" className="btn btn-sm btn-danger" onClick={() => void onDelete()}>Delete</button><button type="button" className="btn btn-sm" onClick={() => setConfirm(false)}>Keep</button></span>
          : <button type="button" className="btn btn-sm btn-ghost danger" onClick={() => setConfirm(true)}>Delete source</button>)}
        <span className="tb-spacer" />
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || idTaken}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

/** Research › Sources: the book's bibliography, edited as records. */
export function SourcesPage({ focus }: { focus?: string }) {
  const { path, file, list, loading } = useSources();
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const ensureLoaded = useBookStore(s => s.ensureLoaded);
  const { projectId, isOwner } = useAccess();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const fragments = useMemo(() => files.filter(f => /^research\/bib\/[^/]+\.ya?ml$/.test(f.path)), [files]);
  useEffect(() => { fragments.filter(f => !f.loaded).forEach(f => void ensureLoaded(f.path)); }, [fragments, ensureLoaded]);
  useEffect(() => { if (focus) setQ(`@${focus}`); }, [focus]);

  const cited = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) if (f.loaded !== false && f.path.endsWith(".md")) for (const k of citedKeys(f.content)) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  }, [files]);
  const taken = useMemo(() => new Set(list.map(s => s.id)), [list]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@/, "");
    const hits = t ? list.filter(s => [s.id, s.title, s["container-title"], ...(s.author ?? []).map(personName), year(s)].join(" ").toLowerCase().includes(t)) : list;
    return [...hits].sort((a, b) => shortCite(a, a.id).localeCompare(shortCite(b, b.id)));
  }, [list, q]);
  const unknown = useMemo(() => [...cited.keys()].filter(k => !taken.has(k)), [cited, taken]);

  async function write(p: string, content: string) {
    if (!projectId) return;
    const current = useBookStore.getState().files.find(f => f.path === p);
    const row = await saveBookDocument(projectId, p, content, current ? current.version : null);
    upsert({ ...row, loaded: true });
  }
  async function save(source: Source, previousId?: string) {
    const state = useBookStore.getState();
    if (!file) {
      const yaml = state.files.find(f => f.path === "book.yaml");
      if (yaml) await write("book.yaml", withBibliography(yaml.content, path));
    }
    await write(path, upsertSource(useBookStore.getState().files.find(f => f.path === path)?.content ?? NEW_BIBLIOGRAPHY, source, previousId));
    // keep the fragments bookkit merges from in step
    const owners = fragments.filter(f => definesSource(f.content, previousId ?? source.id));
    for (const f of owners) await write(f.path, upsertSource(f.content, source, previousId));
    if (!owners.length && fragments.length && !previousId) {
      const own = "research/bib/bookkit.yaml";
      await write(own, upsertSource(useBookStore.getState().files.find(f => f.path === own)?.content ?? NEW_BIBLIOGRAPHY, source));
    }
    setEditing(null);
  }
  async function remove(id: string) {
    await write(path, removeSource(useBookStore.getState().files.find(f => f.path === path)!.content, id));
    for (const f of fragments.filter(x => definesSource(x.content, id))) await write(f.path, removeSource(f.content, id));
    setEditing(null);
  }

  return (
    <div className="board sources-page">
      <div className="board-head">
        <div>
          <h1>Sources</h1>
          <p className="board-sub">What the book cites, kept in <code>{path}</code>. To cite one, use “Cite a source” in the editor’s toolbar. Footnotes and citations become notes in the printed book.</p>
        </div>
        {isOwner && <button className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" size={14} /> Add a source</button>}
      </div>
      <div className="src-toolbar">
        <div className="nav-search src-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${list.length} sources`} aria-label="Search sources" /></div>
        <span className="muted">{list.length} source{list.length === 1 ? "" : "s"} · {[...cited.values()].reduce((a, b) => a + b, 0)} citations</span>
      </div>
      {unknown.length > 0 && <div className="src-warning"><strong>Cited but missing:</strong> {unknown.map(k => <code key={k}>@{k}</code>)}</div>}
      {editing === "new" && <div className="src-card editing"><SourceForm taken={taken} onSave={save} onCancel={() => setEditing(null)} citedCount={0} /></div>}
      {loading && <div className="studio-message quiet"><span className="spinner" /></div>}
      {!loading && !list.length && editing !== "new" && (
        <div className="empty-board"><p>No sources yet. Add the books, articles and pages the book rests on; then cite them in the text.</p></div>
      )}
      <div className="src-list">
        {shown.map(s => editing === s.id ? (
          <div key={s.id} className="src-card editing"><SourceForm initial={s} taken={taken} onSave={save} onCancel={() => setEditing(null)} onDelete={() => remove(s.id)} citedCount={cited.get(s.id) ?? 0} /></div>
        ) : (
          <article key={s.id} className="src-card" id={`src-${s.id}`}>
            <div className="src-main">
              <div className="src-short">{shortCite(s, s.id)}<span className="src-type">{SOURCE_TYPES.find(t => t.value === s.type)?.label ?? s.type}</span></div>
              <div className="src-full">{fullCite(s)}</div>
              {s.note && <div className="src-note-text">{String(s.note)}</div>}
            </div>
            <div className="src-side">
              <code>@{s.id}</code>
              <span className="muted">{cited.get(s.id) ? `cited ${cited.get(s.id)}×` : "not cited"}</span>
              {isOwner && <button className="btn btn-sm" onClick={() => setEditing(s.id)}><Icon name="pen" size={12} /> Edit</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
