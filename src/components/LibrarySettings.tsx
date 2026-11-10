import { useState } from "react";
import { updateShelfStyle, addShelf, deleteShelf, emailLibraryInvite, inviteToLibrary, LIBRARY_SLUG, removeLibraryInvitation, removeLibraryMember, renameShelf, reorderShelves, setLibraryMemberRole, updateLibrary, type Library } from "../lib/supabase-service";
import { libraryUrl } from "../lib/library-host";
import { useLibraryStore } from "../store/useLibraryStore";
import { useAuthStore } from "../store/useAuthStore";
import { Icon } from "./studio/common";
import { StyleFields } from "./studio/StyleFields";
import type { HouseStyle } from "../lib/book-config";

type Role = "coauthor" | "editor" | "viewer";
const ROLES: Array<{ id: Role; label: string; hint: string }> = [
  { id: "viewer", label: "Reader", hint: "reads and comments" },
  { id: "editor", label: "Editor", hint: "suggests and edits" },
  { id: "coauthor", label: "Co-author", hint: "writes, adds books and shelves" },
];

function General({ library, owner }: { library: Library; owner: boolean }) {
  const [name, setName] = useState(library.name);
  const [slug, setSlug] = useState(library.slug);
  const [description, setDescription] = useState(library.description);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const changed = name !== library.name || slug !== library.slug || description !== library.description;
  return (
    <form className="lib-section" onSubmit={async e => {
      e.preventDefault(); setError(""); setState("saving");
      try {
        await updateLibrary(library.id, { name: name.trim(), slug, description: description.trim() });
        if (slug !== library.slug) { window.location.href = libraryUrl(slug); return; }
        setState("saved"); void useLibraryStore.getState().load();
      } catch (err) { setError((err as Error).message); setState(""); }
    }}>
      <label className="field">Name<input value={name} disabled={!owner} onChange={e => { setName(e.target.value); setState(""); }} /></label>
      <label className="field">Address
        <div className="slug-field"><input value={slug} disabled={!owner} onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setState(""); }} /><span>.bookkit.net</span></div>
      </label>
      {slug !== library.slug && <div className="field-hint">The old address stops working. New addresses need the bookkit.net wildcard address set up.</div>}
      {slug && !LIBRARY_SLUG.test(slug) && <div className="field-hint warn">Use lowercase letters, numbers and dashes.</div>}
      <label className="field">Description<textarea rows={3} value={description} disabled={!owner} maxLength={500} placeholder="What lives in this library" onChange={e => { setDescription(e.target.value); setState(""); }} /></label>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {owner && <div className="dialog-actions left"><button className="btn btn-primary btn-sm" disabled={!changed || state === "saving" || !name.trim() || !LIBRARY_SLUG.test(slug)}>{state === "saving" ? "Saving…" : "Save"}</button>{state === "saved" && <span className="muted">Saved</span>}</div>}
    </form>
  );
}

function ShelfStyle({ shelf, canEdit, onSaved }: { shelf: Library["shelves"][number]; canEdit: boolean; onSaved: () => void }) {
  const [style, setStyle] = useState<HouseStyle>((shelf.style ?? {}) as HouseStyle);
  const [state, setState] = useState<"" | "saving">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const changed = JSON.stringify(style) !== JSON.stringify(shelf.style ?? {});
  return (
    <div className="shelf-style">
      <p className="settings-hint">Books on {shelf.name} that use the shelf’s style get these settings in their book.yaml.</p>
      <StyleFields value={style} disabled={!canEdit} onChange={next => { setStyle(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as HouseStyle); setNote(""); }} />
      {canEdit && (
        <div className="dialog-actions left">
          <button className="btn btn-sm btn-primary" disabled={!changed || state === "saving"} onClick={async () => {
            setState("saving"); setError(""); setNote("");
            try {
              const { updated, skipped } = await updateShelfStyle(shelf.id, style as Record<string, unknown>);
              setNote(`Saved.${updated.length ? ` Updated ${updated.join(", ")}.` : ""}${skipped.length ? ` ${skipped.join(", ")} will pick it up when their owners open them.` : ""}`);
              onSaved();
            } catch (e) { setError((e as Error).message); } finally { setState(""); }
          }}>{state === "saving" ? "Saving…" : "Save style"}</button>
          {note && <span className="muted">{note}</span>}
        </div>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

function Shelves({ library, canEdit }: { library: Library; canEdit: boolean }) {
  const reload = useLibraryStore(s => s.load);
  const [shelves, setShelves] = useState([...library.shelves].sort((a, b) => a.position - b.position));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [styling, setStyling] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setError(""); try { await fn(); await reload(); const next = useLibraryStore.getState().libraries?.find(l => l.id === library.id); if (next) setShelves([...next.shelves].sort((a, b) => a.position - b.position)); } catch (e) { setError((e as Error).message); } };
  const move = (i: number, by: number) => {
    const order = shelves.map(s => s.id);
    const [id] = order.splice(i, 1);
    order.splice(i + by, 0, id);
    void run(() => reorderShelves(order));
  };
  return (
    <div className="lib-section">
      <p className="settings-hint">Shelves group the books on your library page, like Fiction and Nonfiction. Drag books between shelves there, or use a book’s ⋯ menu.</p>
      <ul className="lib-shelves">
        {shelves.map((s, i) => (
          <li key={s.id} className={styling === s.id ? "open" : ""}>
            <div className="shelf-row">
            <input defaultValue={s.name} disabled={!canEdit} aria-label="Shelf name" onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) void run(() => renameShelf(s.id, v)); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            {canEdit && <>
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><Icon name="down" size={14} /></button>
              <button className="icon-btn" disabled={i === shelves.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><Icon name="down" size={14} /></button>
              <button className="icon-btn" onClick={() => { if (confirm(`Remove the shelf “${s.name}”? Its books stay in the library, without a shelf.`)) void run(() => deleteShelf(s.id)); }} aria-label={`Remove ${s.name}`}><Icon name="close" size={14} /></button>
            </>}
            <button className="btn btn-sm" onClick={() => setStyling(styling === s.id ? null : s.id)} aria-expanded={styling === s.id}>Style{Object.keys(s.style ?? {}).length ? "" : " · not set"}</button>
            </div>
            {styling === s.id && <ShelfStyle shelf={s} canEdit={canEdit} onSaved={() => void run(async () => {})} />}
          </li>
        ))}
        {!shelves.length && <li className="muted">No shelves yet.</li>}
      </ul>
      {canEdit && (
        <form className="lib-add" onSubmit={e => { e.preventDefault(); if (name.trim()) { const v = name; setName(""); void run(() => addShelf(library.id, v, shelves.length)); } }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="New shelf, e.g. Poetry" aria-label="New shelf" />
          <button className="btn btn-sm" disabled={!name.trim()}><Icon name="plus" size={13} /> Add shelf</button>
        </form>
      )}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

function People({ library, owner }: { library: Library; owner: boolean }) {
  const reload = useLibraryStore(s => s.load);
  const me = useAuthStore(s => s.userId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [lib, setLib] = useState(library);
  const run = async (fn: () => Promise<void>, done?: string) => {
    setError(""); setNote("");
    try { await fn(); await reload(); const next = useLibraryStore.getState().libraries?.find(l => l.id === library.id); if (next) setLib(next); if (done) setNote(done); } catch (e) { setError((e as Error).message); }
  };
  const roleSelect = (value: Role, onChange: (r: Role) => void, disabled = !owner) => (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value as Role)} aria-label="Role">
      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
  );
  return (
    <div className="lib-section">
      <p className="settings-hint">People in the library can open every book in it that isn’t private, as {ROLES.map(r => `${r.label.toLowerCase()} (${r.hint})`).join(", ")}. You can still share single books from a book’s Share page.</p>
      <ul className="lib-people">
        <li><span className="avatar">{(lib.owner_name ?? lib.pending_owner ?? "?").slice(0, 1).toUpperCase()}</span><span className="lib-person"><strong>{lib.owner_name ?? lib.pending_owner}</strong><span className="muted">{lib.pending_owner ? "Owner · hasn’t signed in yet" : "Owner"}</span></span>
          {lib.pending_owner && owner && <button className="btn btn-sm" onClick={() => void run(() => emailLibraryInvite(lib.id, lib.pending_owner!), `Invitation sent to ${lib.pending_owner}.`)}>Email invitation</button>}
        </li>
        {lib.members.map(m => (
          <li key={m.user_id}><span className="avatar">{(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}</span><span className="lib-person"><strong>{m.name ?? m.email}</strong><span className="muted">{m.email}</span></span>
            {roleSelect(m.role, r => void run(() => setLibraryMemberRole(lib.id, m.user_id, r)))}
            {(owner || m.user_id === me) && <button className="icon-btn" aria-label={`Remove ${m.name ?? m.email}`} onClick={() => { if (confirm(m.user_id === me ? "Leave this library?" : `Remove ${m.name ?? m.email} from the library?`)) void run(() => removeLibraryMember(lib.id, m.user_id)); }}><Icon name="close" size={14} /></button>}
          </li>
        ))}
        {lib.invitations.map(i => (
          <li key={i.id}><span className="avatar pending">{i.email.slice(0, 1).toUpperCase()}</span><span className="lib-person"><strong>{i.email}</strong><span className="muted">Invited · joins on first sign-in</span></span>
            {roleSelect(i.role, r => void run(() => inviteToLibrary(lib.id, i.email, r)))}
            <button className="btn btn-sm" onClick={() => void run(() => emailLibraryInvite(lib.id, i.email), `Invitation sent to ${i.email}.`)}>Email</button>
            <button className="icon-btn" aria-label={`Cancel invitation for ${i.email}`} onClick={() => void run(() => removeLibraryInvitation(i.id))}><Icon name="close" size={14} /></button>
          </li>
        ))}
      </ul>
      {owner && (
        <form className="lib-add" onSubmit={e => { e.preventDefault(); const v = email.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { setError("Enter an email address."); return; } setEmail(""); void run(() => inviteToLibrary(lib.id, v, role), `${v} can open the library after signing in.`); }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email to invite" />
          {roleSelect(role, setRole, false)}
          <button className="btn btn-sm btn-primary" disabled={!email.trim()}>Add person</button>
        </form>
      )}
      {note && <div className="save-notice" role="status">{note}</div>}
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}

/** Library settings: name, address and description; shelves; people and their roles. */
export function LibrarySettings({ library, onClose }: { library: Library; onClose: () => void }) {
  const [tab, setTab] = useState<"general" | "shelves" | "people">("general");
  const owner = library.role === "owner";
  const canEdit = owner || library.role === "coauthor";
  return (
    <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog lib-dialog" role="dialog" aria-label="Library settings">
        <div className="lib-dialog-head">
          <h2>{library.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        <div className="segmented" role="tablist">
          {(["general", "shelves", "people"] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "general" ? "Details" : t === "shelves" ? `Shelves · ${library.shelves.length}` : `People · ${library.members.length + 1}`}</button>
          ))}
        </div>
        {tab === "general" && <General library={library} owner={owner} />}
        {tab === "shelves" && <Shelves library={library} canEdit={canEdit} />}
        {tab === "people" && <People library={library} owner={owner} />}
      </div>
    </div>
  );
}
