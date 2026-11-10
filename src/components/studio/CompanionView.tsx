import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorBus } from "./editorBus";
import { useBookStore } from "../../store/useBookStore";
import { downloadBookAsset } from "../../lib/supabase-service";
import { splitDocument } from "../../lib/markdown-doc";
import { citedChapters } from "../../lib/book-model";
import { ActiveDoc } from "./ActiveDoc";
import { useDocSession } from "./useDocSession";
import { Icon, useAccess } from "./common";

const GROUP_LABEL: Record<string, string> = {
  story: "Story", bible: "Story bible", plan: "Plan", craft: "Craft", research: "Research",
  matter: "Front & back matter", publication: "Publishing", source: "Book setup",
};

/** Where `words` are in `text`, allowing any run of space or line breaks between them (YAML wraps). */
function findLoose(text: string, words: string): [number, number] | null {
  const parts = words.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]").replace(/["“”]/g, "[\"“”]"));
  if (!parts.length) return null;
  const m = new RegExp(parts.join("\\s+"), "i").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

function SourceEditor({ path, find, nonce }: { path: string; find?: string; nonce?: number }) {
  const { projectId, userId, canEdit, isOwner } = useAccess();
  const session = useDocSession(path, { projectId, userId, editable: canEdit, suggesting: canEdit && !isOwner });
  const setBusSession = useEditorBus(s => s.setSession);
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = !!session.text;
  useEffect(() => { setBusSession(session); }, [session, setBusSession]);
  useEffect(() => () => setBusSession(null), [setBusSession]);
  // a chip that quotes words in this file (an afterword in the metadata) opens it at those words
  useEffect(() => {
    const el = ref.current;
    if (!el || !find || !ready) return;
    const at = findLoose(el.value, find);
    if (!at) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(at[0], at[1]);
    const line = el.value.slice(0, at[0]).split("\n").length - 1;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.scrollTop = Math.max(0, line * lh - el.clientHeight / 3);
    el.closest(".doc-scroll, main")?.scrollTo?.({ top: 0 });
  }, [find, nonce, ready]);
  if (session.state === "loading" && !session.text) return <div className="doc-loading"><span className="spinner" /> Opening…</div>;
  return <textarea ref={ref} className="markdown-source" value={session.text} readOnly={!canEdit} spellCheck={false} onChange={e => session.setText(e.target.value)} aria-label="File contents" />;
}

export function CompanionView() {
  const location = useBookStore(s => s.location);
  const model = useBookStore(s => s.model)!;
  const file = useBookStore(s => s.files.find(f => f.path === location.path));
  const doc = model.companions.find(d => d.path === location.path);
  const { projectId } = useAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = useMemo(() => (file?.loaded && !file.asset ? splitDocument(file.content).metadata : {}), [file]);
  const cites = useMemo(() => (file?.loaded && !file.asset ? citedChapters(file.content).length : 0), [file]);

  if (!file || !doc) return <div className="page doc-page"><div className="doc-missing">This page no longer exists.</div></div>;
  const isMarkdown = /\.md$/i.test(file.path);
  const checked = meta.checked ? String(meta.checked) : "";

  return (
    <div className="page doc-page" key={file.path}>
      <div className="doc-head">
        <div className="doc-eyebrow">
          <span>{GROUP_LABEL[doc.group] ?? ""}</span>
          {checked && <span className="pill" title="Last compared with the manuscript">Checked {checked}</span>}
          {cites > 0 && <span className="pill subtle">{cites} chapter{cites === 1 ? "" : "s"} cited</span>}
        </div>
        <h1 className="doc-title">{doc.title}</h1>
      </div>
      {file.asset ? (
        <div className="asset-view">
          <Icon name="file" size={28} />
          <div>
            <div className="asset-name">{file.path.split("/").pop()}</div>
            <div className="asset-meta">{(file.asset as any).is_directory ? "Folder" : `${(((file.asset as any).size_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB attachment`}</div>
          </div>
          {!(file.asset as any).is_directory && projectId && (
            <button className="btn" disabled={busy} onClick={() => { setBusy(true); setError(""); void downloadBookAsset(projectId, file).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
              <Icon name="download" size={14} /> {busy ? "Preparing…" : "Download"}
            </button>
          )}
          {error && <div className="inline-error" role="alert">{error}</div>}
        </div>
      ) : !file.loaded ? (
        <div className="doc-loading"><span className="spinner" /> Opening…</div>
      ) : file.content.length > 400_000 ? (
        <div className="large-file">
          <p className="markdown-mode-note">This is a large source file ({(file.content.length / 1_000_000).toFixed(1)} million characters), so it opens as a read-only preview of the beginning. Download the book archive to work with all of it.</p>
          <pre className="markdown-source large-preview">{file.content.slice(0, 60_000)}</pre>
        </div>
      ) : isMarkdown ? (
        <ActiveDoc key={file.path} path={file.path} writable chapterAnchors find={location.find} anchor={location.anchor} />
      ) : (
        <SourceEditor key={file.path} path={file.path} find={location.find} nonce={location.nonce} />
      )}
    </div>
  );
}
