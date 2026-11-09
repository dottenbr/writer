import { useEffect, useMemo, useRef, useState } from "react";
import { useBookStore } from "../../store/useBookStore";
import { useEditorBus } from "./editorBus";
import { useDocSession } from "./useDocSession";
import { RichEditor } from "./RichEditor";
import { formatWords, Icon, initials, KIND_LABEL, useAccess, useEntityMatcher } from "./common";
import { entityKindForPath, entityMatcher, mentionsIn, slugify, type Entity, type EntityKind } from "../../lib/book-model";
import { markdownToHtml, markdownToPlain, splitDocument } from "../../lib/markdown-doc";
import { entryFormFor, entryOps, sectionFields } from "../../lib/entity-section";
import { FULL_PAGE } from "../../lib/book-url";
import { saveBookDocument } from "../../lib/supabase-service";

export const KIND_ORDER: EntityKind[] = ["character", "place", "organization", "motif", "entry"];
export const KIND_PLURAL: Record<EntityKind, string> = { character: "Characters", place: "Places", organization: "Organizations", motif: "Motifs", entry: "Entries" };
const KIND_NEW: Record<EntityKind, string> = { character: "New character", place: "New place", organization: "New organization", motif: "New motif", entry: "New entry" };

/** Entity id → chapter numbers that mention it. */
export function useAppearances(): Map<string, number[]> {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const matcher = useEntityMatcher();
  return useMemo(() => {
    const out = new Map<string, number[]>();
    for (const c of model.chapters) {
      const text = files.find(f => f.path === c.currentPath)?.content ?? "";
      mentionsIn(markdownToPlain(splitDocument(text).body), matcher).forEach((_, id) => out.set(id, [...(out.get(id) ?? []), c.number]));
    }
    return out;
  }, [model.chapters, files, matcher]);
}

/** Plain text for a card: chapter citations dropped, spacing and punctuation tidied. */
const tidy = (t: string) => t.replace(/\(\s*\*?Chs?\.[^)]*\)/g, "").replace(/\s+([,;.:!?])/g, "$1").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();

/** The short line under a card's name: the first field (Role, Where…) or the first sentence. */
function tagline(e: Entity): string {
  const fields = sectionFields(e.markdown);
  const role = fields.find(f => /^(role|who|what|where|kind|type)$/i.test(f.label)) ?? fields[0];
  const text = role ? role.value : e.summary;
  return tidy(markdownToPlain(text));
}

export function EntityTile({ entity, chapters, onOpen }: { entity: Entity; chapters?: number[]; onOpen: () => void }) {
  const fields = sectionFields(entity.markdown).filter(f => !/^(role|who|what|where|kind|type)$/i.test(f.label)).slice(0, 2);
  return (
    <button className={`entity-tile ${entity.group ? "is-group" : ""}`} onClick={onOpen}>
      <div className="entity-tile-top">
        <span className={`mention-avatar large ${entity.kind}`}>{initials(entity.name)}</span>
        <div className="entity-tile-head">
          <div className="entity-tile-name">{entity.name}</div>
          <div className="entity-tile-kind">{entity.group ? "Group" : KIND_LABEL[entity.kind]}{chapters?.length ? ` · ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}` : ""}</div>
        </div>
      </div>
      <p className="entity-tile-summary">{tagline(entity) || "No description yet."}</p>
      {fields.length > 0 && (
        <dl className="entity-tile-fields">
          {fields.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{tidy(markdownToPlain(f.value))}</dd></div>)}
        </dl>
      )}
    </button>
  );
}

/** The cards for one bible page (all characters, all places…). */
export function EntityIndex({ path }: { path: string }) {
  const model = useBookStore(s => s.model)!;
  const file = useBookStore(s => s.files.find(f => f.path === path));
  const go = useBookStore(s => s.go);
  const upsert = useBookStore(s => s.upsert);
  const { projectId, isOwner } = useAccess();
  const appearances = useAppearances();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const doc = model.companions.find(d => d.path === path);
  const entities = model.entities.filter(e => e.path === path);
  const kind = entityKindForPath(path) ?? entities[0]?.kind ?? "entry";
  const intro = useMemo(() => {
    if (!file?.content) return "";
    const body = splitDocument(file.content).body;
    const lead = body.split(/^## |^[-*]\s+\*\*/m)[0];
    return lead.split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !p.startsWith("#")).join("\n\n");
  }, [file?.content]);
  const shown = entities.filter(e => !q || (e.name + " " + e.markdown).toLowerCase().includes(q.toLowerCase()));

  async function add() {
    const clean = name.trim();
    if (!clean || !projectId || !file) return;
    if (entities.some(e => e.slug === slugify(clean))) { setError(`There is already an entry called ${clean}.`); return; }
    setBusy(true); setError("");
    try {
      const row = await saveBookDocument(projectId, path, entryOps(entryFormFor(file.content)).add(file.content, clean), file.version);
      upsert({ ...row, loaded: true });
      setAdding(false); setName("");
      setTimeout(() => go(path, { anchor: slugify(clean), view: "bible" }), 450);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="board entity-index">
      <header className="board-head">
        <div>
          <div className="doc-eyebrow"><button className="link-btn" onClick={() => go("", { view: "bible" })}>Story bible</button></div>
          <h1>{doc?.title ?? KIND_PLURAL[kind]}</h1>
          {intro && <p className="board-sub">{markdownToPlain(intro)}</p>}
        </div>
        <div className="board-actions">
          {entities.length > 6 && <div className="board-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${(doc?.title ?? "").toLowerCase()}`} aria-label="Search" /></div>}
          <button className="btn btn-sm" onClick={() => go(path, { anchor: FULL_PAGE, view: "bible" })}><Icon name="file" size={14} /> Whole page</button>
          {isOwner && <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> {KIND_NEW[kind]}</button>}
        </div>
      </header>
      {adding && (
        <form className="add-entity" onSubmit={e => { e.preventDefault(); void add(); }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Name" aria-label="Name" onKeyDown={e => { if (e.key === "Escape") setAdding(false); }} />
          <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add"}</button>
          <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setError(""); }}>Cancel</button>
          {error && <div className="inline-error" role="alert">{error}</div>}
        </form>
      )}
      <div className="card-grid entity-grid">
        {shown.map(e => <EntityTile key={e.id} entity={e} chapters={appearances.get(e.id)} onOpen={() => go(path, { anchor: e.slug, view: "bible" })} />)}
      </div>
      {!entities.length && <div className="empty-board"><p>No entries yet.{isOwner ? " Add the first one." : ""}</p></div>}
    </div>
  );
}

/** One character, place or other entry as its own page. Edits only its section of the bible file. */
export function EntityPage({ path, slug }: { path: string; slug: string }) {
  const model = useBookStore(s => s.model)!;
  const go = useBookStore(s => s.go);
  const { projectId, userId, canEdit, suggesting, isOwner } = useAccess();
  const session = useDocSession(path, { projectId, userId, editable: canEdit, suggesting });
  const setBusSession = useEditorBus(s => s.setSession);
  const setBusEditor = useEditorBus(s => s.setEditor);
  const setSelection = useEditorBus(s => s.setSelection);
  const appearances = useAppearances();
  const allMatcher = useEntityMatcher();
  const textRef = useRef(session.text);
  textRef.current = session.text;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // After deleting, go back to the cards once the change is saved.
  useEffect(() => { if (leaving && session.state === "saved") go(path, { view: "bible" }); }, [leaving, session.state, go, path]);

  useEffect(() => { setBusSession(session); }, [session, setBusSession]);
  useEffect(() => () => { setBusSession(null); setBusEditor(null); setSelection(""); }, [setBusSession, setBusEditor, setSelection]);

  const ops = useMemo(() => entryOps(entryFormFor(session.text)), [session.text]);
  const body = useMemo(() => ops.body(session.text, slug), [ops, session.text, slug]);
  const lossless = useMemo(() => (body == null ? true : markdownToHtml(body).lossless), [body]);
  const siblings = model.entities.filter(e => e.path === path);
  const entity = siblings.find(e => e.slug === slug);
  const heading = useMemo(() => {
    const line = session.text.split("\n").find(l => l.startsWith("## ") && slugify(l.slice(3).replace(/[*_`]/g, "")) === slug);
    if (line) return line.slice(3).trim();
    const bullet = session.text.split("\n").map(l => l.match(/^[-*]\s+\*\*(.+?)\*\*/)?.[1]?.replace(/[.:]\s*$/, "").trim()).find(n => n && slugify(n.replace(/[*_`]/g, "")) === slug);
    return bullet ?? entity?.name ?? "";
  }, [session.text, slug, entity]);
  const [name, setName] = useState(heading);
  useEffect(() => setName(heading), [heading]);
  const links = useMemo(() => ({ entities: allMatcher, chapterAnchors: true }), [allMatcher]);
  const doc = model.companions.find(d => d.path === path);
  const index = siblings.findIndex(e => e.slug === slug);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const kind = entity?.kind ?? entityKindForPath(path) ?? "entry";
  const chapters = entity ? appearances.get(entity.id) ?? [] : [];
  const single = useMemo(() => (entity ? entityMatcher([entity]) : null), [entity]);

  if (session.state === "loading" && !session.text) return <div className="page doc-page"><div className="doc-loading"><span className="spinner" /> Opening…</div></div>;
  if (body == null) {
    if (leaving) return <div className="page doc-page"><div className="doc-loading"><span className="spinner" /> Deleting…</div></div>;
    return (
      <div className="page doc-page">
        <div className="doc-missing">This entry isn’t on the {doc?.title.toLowerCase() ?? "bible"} page any more. <button className="link-btn inline" onClick={() => go(path, { view: "bible" })}>See all {doc?.title.toLowerCase()}</button></div>
      </div>
    );
  }

  const rename = () => {
    const clean = name.trim();
    if (!clean || clean === heading || !canEdit) { setName(heading); return; }
    session.setText(ops.rename(textRef.current, slug, clean));
    go(path, { anchor: slugify(clean), view: "bible" });
  };

  return (
    <div className="page doc-page entity-page">
      <nav className="entity-crumbs" aria-label="Entries">
        <button className="link-btn" onClick={() => go(path, { view: "bible" })}><Icon name="back" size={13} /> {doc?.title ?? KIND_PLURAL[kind]}</button>
        <span className="entity-pager">
          <button className="icon-btn" disabled={!prev} onClick={() => prev && go(path, { anchor: prev.slug, view: "bible" })} title={prev ? prev.name : undefined} aria-label="Previous entry"><Icon name="back" size={14} /></button>
          <span>{index + 1} of {siblings.length}</span>
          <button className="icon-btn" disabled={!next} onClick={() => next && go(path, { anchor: next.slug, view: "bible" })} title={next ? next.name : undefined} aria-label="Next entry"><Icon name="chevron" size={14} /></button>
        </span>
      </nav>
      <header className="entity-head">
        <span className={`mention-avatar xl ${kind}`}>{initials(heading)}</span>
        <div className="entity-head-text">
          <div className="doc-eyebrow"><span>{entity?.group ? "Group" : KIND_LABEL[kind]}</span>{chapters.length > 0 && <span className="pill subtle">In {chapters.length} chapter{chapters.length === 1 ? "" : "s"}</span>}</div>
          {canEdit && !suggesting ? (
            <input className="entity-name-input" value={name} aria-label="Name" onChange={e => setName(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setName(heading); (e.target as HTMLInputElement).blur(); } }} />
          ) : <h1 className="doc-title">{heading}</h1>}
        </div>
      </header>
      {session.error && <div className="save-problem" role="alert"><span>Not saved: {session.error}</span><button className="btn btn-sm" onClick={() => void session.saveNow()}>Retry</button></div>}
      {lossless || !canEdit ? (
        <RichEditor
          body={body}
          reloadKey={`${path}#${slug}:${session.reloadKey}`}
          editable={canEdit && session.state !== "loading"}
          placeholder={`Who is ${heading}? Role, look, what they want, where they appear…`}
          links={links}
          onReady={setBusEditor}
          onSelection={setSelection}
          onChange={next => session.setText(ops.replace(textRef.current, slug, next))}
        />
      ) : (
        <div className="markdown-mode">
          <p className="markdown-mode-note">This entry uses formatting the visual editor can’t keep exactly, so it opens as plain Markdown.</p>
          <textarea className="markdown-source" value={body} spellCheck onChange={e => session.setText(ops.replace(textRef.current, slug, e.target.value))} aria-label="Entry text" />
        </div>
      )}
      {chapters.length > 0 && single && (
        <section className="entity-appears">
          <div className="panel-label">Appears in</div>
          <div className="chip-row">
            {chapters.map(n => {
              const c = model.chapters.find(x => x.number === n)!;
              return <button key={n} className="chip" onClick={() => go(c.authorPath ?? c.currentPath, { find: entity!.aliases[0] ?? entity!.name })}><span className="chip-num">{n}</span> {c.title}</button>;
            })}
          </div>
        </section>
      )}
      <footer className="entity-foot">
        <span className="muted">{formatWords(markdownToPlain(body).split(/\s+/).filter(Boolean).length)} words · part of the <button className="link-btn inline" onClick={() => go(path, { anchor: FULL_PAGE, view: "bible" })}>{doc?.title.toLowerCase() ?? "bible"} page</button></span>
        {isOwner && (confirmDelete ? (
          <span className="confirm-inline">Delete {heading}? <button className="btn btn-sm btn-danger" disabled={leaving} onClick={() => { setLeaving(true); session.setText(ops.remove(textRef.current, slug)); }}>{leaving ? "Deleting…" : "Delete"}</button><button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button></span>
        ) : <button className="link-btn danger" onClick={() => setConfirmDelete(true)}>Delete entry</button>)}
      </footer>
    </div>
  );
}
