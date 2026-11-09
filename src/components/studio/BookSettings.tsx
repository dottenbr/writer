import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useBookStore } from "../../store/useBookStore";
import { downloadBookkitArchive, placeBook, readBookPlacement, saveBookDocument } from "../../lib/supabase-service";
import { canWriteIn, useLibraryStore } from "../../store/useLibraryStore";
import { libraryUrl } from "../../lib/library-host";
import { bookSlug } from "../../lib/book-url";
import { exportManuscriptDocx, exportManuscriptText } from "../../lib/export-book";
import { Collaboration } from "../Collaboration";
import { SnapshotBrowser } from "../SnapshotBrowser";
import { Icon, useAccess } from "./common";
import { BookConfiguration } from "./BookConfiguration";


/** Which library and shelf the book is on, and whether the library's people can open it. */
function LibraryCard() {
  const { isOwner, projectId } = useAccess();
  const libraries = useLibraryStore(s => s.libraries) ?? [];
  const reloadLibraries = useLibraryStore(s => s.load);
  const catalog = useProjectStore(s => s.projectCatalog);
  const [place, setPlace] = useState<{ library_id: string | null; shelf_id: string | null; private: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (projectId) readBookPlacement(projectId).then(setPlace).catch(e => setError(e.message)); }, [projectId]);
  if (!place || !projectId) return null;
  const library = libraries.find(l => l.id === place.library_id);
  const canShelve = isOwner || canWriteIn(library);
  const update = async (patch: Partial<typeof place>) => {
    setError("");
    try {
      await placeBook(projectId, patch);
      const next = await readBookPlacement(projectId);
      setPlace(next);
      void reloadLibraries();
      if (patch.library_id !== undefined) {
        const slug = libraries.find(l => l.id === next.library_id)?.slug ?? null;
        window.location.href = libraryUrl(slug, "/" + bookSlug(catalog, projectId) + "/settings");
      }
    } catch (e) { setError((e as Error).message); }
  };
  const people = (library?.members.length ?? 0) + (library ? 1 : 0);
  return (
    <section className="settings-card">
      <h2>Library</h2>
      <div className="settings-grid">
        <label className="field">Library
          <select value={place.library_id ?? ""} disabled={!isOwner} onChange={e => void update({ library_id: e.target.value || null })}>
            {!place.library_id && <option value="">Not in a library</option>}
            {libraries.filter(l => l.id === place.library_id || canWriteIn(l)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="field">Shelf
          <select value={place.shelf_id ?? ""} disabled={!canShelve || !library} onChange={e => void update({ shelf_id: e.target.value || null })}>
            <option value="">No shelf</option>
            {[...(library?.shelves ?? [])].sort((a, b) => a.position - b.position).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {library && (
        <label className="check-row">
          <input type="checkbox" checked={place.private} disabled={!isOwner} onChange={e => void update({ private: e.target.checked })} />
          <span><strong>Private</strong> — only you and the people you share it with below. {place.private ? `The ${people} people in ${library.name} don’t see it.` : `Everyone in ${library.name} can open it with their library role.`}</span>
        </label>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </section>
  );
}

export function BookSettings() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const project = useProjectStore(s => s.currentProject());
  const deleteProject = useProjectStore(s => s.deleteProject);
  const importProjectZip = useProjectStore(s => s.importProjectZip);
  const setShowApiSettings = useProjectStore(s => s.setShowApiSettings);
  const { isOwner, projectId, canEdit } = useAccess();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");



  const written = model.chapters.filter(c => c.authorPath && (!c.started || !c.referencePath)).length;

  return (
    <div className="settings">
      <header className="board-head">
        <div>
          <h1>Book settings</h1>
          <p className="board-sub">Details, sharing, history and export for <em>{model.title}</em>.</p>
        </div>
      </header>

      <BookConfiguration />

      <LibraryCard />

      <section className="settings-card">
        <h2>Sharing</h2>
        <p className="settings-hint">Co-authors and editors suggest changes that you accept or reject. Viewers can read and comment.</p>
        <Collaboration />
      </section>

      <section className="settings-card">
        <h2>Export</h2>
        <div className="export-row">
          <div>
            <strong>Reading copy (.docx)</strong>
            <p className="settings-hint">A clean Word document of the manuscript as it stands. Choose whether unwritten chapters use the reference draft.</p>
          </div>
          <div className="export-actions">
            <button className="btn btn-sm" disabled={!!busy || written === 0} onClick={async () => { setBusy("docx"); try { await exportManuscriptDocx(model, files, { authorOnly: true }); } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); } }}><Icon name="download" size={14} /> Your chapters ({written})</button>
            {model.hasDraft && <button className="btn btn-sm" disabled={!!busy} onClick={async () => { setBusy("docx"); try { await exportManuscriptDocx(model, files, { authorOnly: false }); } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); } }}><Icon name="download" size={14} /> With reference draft</button>}
          </div>
        </div>
        <div className="export-row">
          <div>
            <strong>Markdown or plain text</strong>
            <p className="settings-hint">The manuscript as a single file, chapter by chapter{model.hasDraft ? ", using your chapters and the reference draft where you haven’t written yet" : ""}.</p>
          </div>
          <div className="export-actions">
            <button className="btn btn-sm" onClick={() => exportManuscriptText(model, files, { authorOnly: !model.hasDraft, plain: false })}><Icon name="download" size={14} /> .md</button>
            <button className="btn btn-sm" onClick={() => exportManuscriptText(model, files, { authorOnly: !model.hasDraft, plain: true })}><Icon name="download" size={14} /> .txt</button>
          </div>
        </div>
        <div className="export-row">
          <div>
            <strong>Bookkit archive (.zip)</strong>
            <p className="settings-hint">The complete book: every chapter, bible and plan page, research file and setting. Use it to build EPUB, PDF and print editions with Bookkit, or to move the book.</p>
          </div>
          <div className="export-actions">
            <button className="btn btn-sm" disabled={!!busy || !project} onClick={async () => { setBusy("zip"); setMessage(""); try { await downloadBookkitArchive(project!.id, project!.name, setMessage); } catch (e) { if ((e as Error).name !== "AbortError") setMessage((e as Error).message); } finally { setBusy(""); } }}><Icon name="download" size={14} /> Download archive</button>
            <label className="btn btn-sm">
              Import a book
              <input type="file" accept=".zip" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy("import"); try { await importProjectZip(file, setMessage); } catch (err) { setMessage((err as Error).message); } finally { setBusy(""); } }} />
            </label>
          </div>
        </div>
        {message && <p className="settings-status" role="status">{message}</p>}
      </section>

      <section className="settings-card">
        <h2>History</h2>
        <p className="settings-hint">Save a snapshot before big revisions. You can compare any snapshot with the current book and restore it.</p>
        <SnapshotBrowser />
      </section>

      <section className="settings-card">
        <h2>Assistant</h2>
        <p className="settings-hint">Connect Anthropic or OpenAI with your own key. Keys stay in this browser.</p>
        <button className="btn btn-sm" disabled={!canEdit} onClick={() => setShowApiSettings(true)}><Icon name="sparkle" size={14} /> Configure AI provider</button>
      </section>

      {isOwner && (
        <section className="settings-card danger">
          <h2>Delete book</h2>
          <p className="settings-hint">Removes the book and everything in it for all collaborators. Type the title to confirm.</p>
          <div className="danger-row">
            <input className="field-input" value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} placeholder={model.title} aria-label="Type the title to confirm" />
            <button className="btn btn-danger btn-sm" disabled={confirmDelete !== model.title || !project} onClick={() => project && void deleteProject(project.id)}>Delete permanently</button>
          </div>
        </section>
      )}
    </div>
  );
}
