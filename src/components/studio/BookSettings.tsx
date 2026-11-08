import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { useBookStore } from "../../store/useBookStore";
import { downloadBookkitArchive, saveBookDocument } from "../../lib/supabase-service";
import { exportManuscriptDocx, exportManuscriptText } from "../../lib/export-book";
import { Collaboration } from "../Collaboration";
import { SnapshotBrowser } from "../SnapshotBrowser";
import { Icon, useAccess } from "./common";

function yamlLine(content: string, key: string, value: string) {
  const line = `${key}: ${JSON.stringify(value)}`;
  return new RegExp(`^${key}:.*$`, "m").test(content) ? content.replace(new RegExp(`^${key}:.*$`, "m"), line) : content + `\n${line}\n`;
}

export function BookSettings() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const upsert = useBookStore(s => s.upsert);
  const project = useProjectStore(s => s.currentProject());
  const renameProject = useProjectStore(s => s.renameProject);
  const deleteProject = useProjectStore(s => s.deleteProject);
  const importProjectZip = useProjectStore(s => s.importProjectZip);
  const setShowApiSettings = useProjectStore(s => s.setShowApiSettings);
  const { isOwner, projectId, canEdit } = useAccess();
  const [title, setTitle] = useState(model.title);
  const [author, setAuthor] = useState(model.author);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  async function saveDetails() {
    const yaml = files.find(f => f.path === "book.yaml");
    if (!yaml || !projectId) return;
    setBusy("details"); setMessage("");
    try {
      const next = yamlLine(yamlLine(yaml.content, "title", title.trim()), "author", author.trim());
      if (next !== yaml.content) upsert({ ...(await saveBookDocument(projectId, "book.yaml", next, yaml.version)), loaded: true });
      if (project && title.trim() && title.trim() !== project.name) await renameProject(project.id, title.trim());
      setMessage("Book details saved.");
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(""); }
  }

  const written = model.chapters.filter(c => c.authorPath && (!c.started || !c.referencePath)).length;

  return (
    <div className="settings">
      <header className="board-head">
        <div>
          <h1>Book settings</h1>
          <p className="board-sub">Details, sharing, history and export for <em>{model.title}</em>.</p>
        </div>
      </header>

      <section className="settings-card">
        <h2>Details</h2>
        <div className="settings-grid">
          <label className="field">Title<input value={title} disabled={!isOwner} onChange={e => setTitle(e.target.value)} /></label>
          <label className="field">Author<input value={author} disabled={!isOwner} onChange={e => setAuthor(e.target.value)} /></label>
        </div>
        {isOwner && <button className="btn btn-primary btn-sm" disabled={busy === "details" || (title === model.title && author === model.author) || !title.trim()} onClick={() => void saveDetails()}>Save details</button>}
        <p className="settings-hint">This book follows a human-authored policy: the assistant can give editorial notes and help with plan and bible pages, but never writes your prose.</p>
      </section>

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
