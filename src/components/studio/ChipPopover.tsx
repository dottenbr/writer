import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { EditorView } from "@tiptap/pm/view";
import { useBookStore } from "../../store/useBookStore";
import { anchorLabel, findAnchors, formatAnchor, formatTrailing, parseAnchor, resolveAnchor, splitFact, type Anchor } from "../../lib/anchors";
import { blockAt, blockText, type ChipKind } from "../../lib/markup-chips";
import { formatCitation, fullCite, parseCitation, type CiteItem } from "../../lib/bibliography";
import { CITATION } from "../../lib/pandoc-marks";
import { matterChoices, matterLookup } from "../../lib/book-matter";
import { Icon } from "./common";
import { useSources } from "./useSources";

type Mode = ChipKind | "new-anchor" | "new-cite" | "new-footnote";

interface PopoverState {
  open: null | { mode: Mode; view: EditorView; at: number; index: number; id?: string; rect: DOMRect; editable: boolean };
  show: (o: NonNullable<PopoverState["open"]>) => void;
  close: () => void;
}

export const useChipPopover = create<PopoverState>(set => ({
  open: null,
  show: open => set({ open }),
  close: () => set({ open: null }),
}));

const contentOf = (path: string) => {
  const f = useBookStore.getState().files.find(x => x.path === path);
  return f?.loaded === false ? undefined : f?.content;
};
const matterOf = (name: string) => { const s = useBookStore.getState(); return matterLookup(s.files, s.model?.config)(name); };

/** Inline Markdown with *italics* (how anchors are written) as editor content. */
function inlineContent(view: EditorView, text: string) {
  const { schema } = view.state;
  const italic = schema.marks.italic?.create();
  const nodes = [];
  for (const part of text.split(/(\*[^*\n]+\*)/)) {
    if (!part) continue;
    const em = part.length > 2 && part.startsWith("*") && part.endsWith("*");
    nodes.push(schema.text(em ? part.slice(1, -1) : part, em && italic ? [italic] : []));
  }
  return nodes;
}

/** Replace a span of a block's text (offsets into its Markdown-ish text) with Markdown. */
function replaceText(view: EditorView, at: number, from: number, to: number, text: string) {
  const block = blockAt(view.state, at);
  if (!block) return;
  const [start, end] = block.range(from, to);
  const tr = text ? view.state.tr.replaceWith(start, end, inlineContent(view, text)) : view.state.tr.delete(start, end);
  view.dispatch(tr);
}

export function AnchorForm({ initial, onSave, onCancel, onRemove }: { initial?: Anchor; onSave: (raw: string) => void; onCancel: () => void; onRemove?: () => void }) {
  const chapters = useBookStore(s => s.model?.chapters ?? []);
  const multi = (initial?.refs.length ?? 0) > 1;
  const [asText, setAsText] = useState(multi);
  const [raw, setRaw] = useState(initial?.raw ?? "");
  const [offPage, setOffPage] = useState(!!initial?.offPage);
  const files = useBookStore(s => s.files);
  const config = useBookStore(s => s.model?.config);
  const parts = useMemo(() => matterChoices(files, config), [files, config]);
  const [matter, setMatter] = useState<string>(initial?.matter ?? "");
  const [chapter, setChapter] = useState<number>(initial?.refs[0]?.chapters[0] ?? chapters[0]?.number ?? 1);
  const [scene, setScene] = useState<number>(initial?.refs[0]?.scenes[0] ?? 0);
  const [quote, setQuote] = useState(initial?.quote ?? "");
  const ch = chapters.find(c => c.number === chapter);
  const draft = asText ? raw.trim() : formatAnchor({ chapters: [chapter], scenes: scene ? [scene] : [], quote, offPage, matter: matter || undefined });
  const parsed = useMemo(() => (findAnchors(draft)[0]?.raw === draft ? parseAnchor(draft) : null), [draft]);
  const check = parsed ? resolveAnchor(parsed, chapters, contentOf, matterOf) : null;
  return (
    <form className="chip-form" onSubmit={e => { e.preventDefault(); if (parsed) onSave(draft); }}>
      {asText ? (
        <label className="field">Anchor<input value={raw} onChange={e => setRaw(e.target.value)} placeholder="*Ch. 3, Scene 4*: “words”" autoFocus /></label>
      ) : (
        <>
          <label className="check-row"><input type="checkbox" checked={offPage} onChange={e => setOffPage(e.target.checked)} /> <span>Off the page (fixed for continuity, never stated)</span></label>
          {!offPage && (
            <>
              <label className="field">{parts.length ? "Where" : "Chapter"}
                <select value={matter ? `m:${matter}` : String(chapter)} onChange={e => {
                  const v = e.target.value;
                  if (v.startsWith("m:")) setMatter(v.slice(2)); else { setMatter(""); setChapter(Number(v)); }
                  setScene(0);
                }}>
                  {parts.length ? <optgroup label="Chapters">{chapters.map(c => <option key={c.number} value={c.number}>{c.number}. {c.title || `Chapter ${c.number}`}</option>)}</optgroup>
                    : chapters.map(c => <option key={c.number} value={c.number}>{c.number}. {c.title || `Chapter ${c.number}`}</option>)}
                  {parts.length > 0 && <optgroup label="Outside the chapters">{parts.map(p => <option key={p.anchor} value={`m:${p.anchor}`}>{p.anchor}</option>)}</optgroup>}
                </select>
              </label>
              {!matter && ch && ch.sceneTitles.length > 0 && (
                <label className="field">Scene
                  <select value={scene} onChange={e => setScene(Number(e.target.value))}>
                    <option value={0}>The whole chapter</option>
                    {ch.sceneTitles.map((t, i) => <option key={i} value={i + 1}>{t}</option>)}
                  </select>
                </label>
              )}
              <label className="field">{matter ? "Words in it" : "Words in the chapter"} <span className="muted">(optional)</span>
                <input value={quote} onChange={e => setQuote(e.target.value)} placeholder="The exact words that establish it" />
              </label>
            </>
          )}
        </>
      )}
      {draft && !parsed && <div className="chip-problem">This isn’t an anchor yet. Write it like *Ch. 3, Scene 4* or *Afterword*.</div>}
      {check?.problem && <div className="chip-problem">{check.problem}</div>}
      <div className="chip-actions">
        {onRemove && <button type="button" className="btn btn-sm btn-ghost danger" onClick={onRemove}>Remove</button>}
        <button type="button" className="link-btn" onClick={() => { setRaw(draft); setAsText(!asText); }}>{asText ? "Use the picker" : "Edit as text"}</button>
        <span className="tb-spacer" />
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={!parsed}>Save</button>
      </div>
    </form>
  );
}

function AnchorPanel({ view, at, index, editable, isNew, close }: { view: EditorView; at: number; index: number; editable: boolean; isNew: boolean; close: () => void }) {
  const chapters = useBookStore(s => s.model?.chapters ?? []);
  const go = useBookStore(s => s.go);
  const block = blockAt(view.state, at);
  const [editing, setEditing] = useState(isNew);
  if (!block) return null;
  const all = findAnchors(block.text);
  const tail = splitFact(block.text);
  const target = isNew ? undefined : all[index];
  const tailStart = all.findIndex(a => a.from >= tail.tailFrom);
  const inTail = target ? target.from >= tail.tailFrom : true;
  const resolved = target ? resolveAnchor(target, chapters, contentOf, matterOf) : null;

  const save = (raw: string) => {
    if (target && !inTail) replaceText(view, at, target.from, target.to, raw);
    else {
      const anchors = all.filter(a => a.from >= tail.tailFrom).map(a => parseAnchor(a.raw));
      if (target) anchors[index - tailStart] = parseAnchor(raw); else anchors.push(parseAnchor(raw));
      const text = tail.text.replace(/\s+$/, "");
      replaceText(view, at, text.length, block.text.length, formatTrailing(anchors));
    }
    close();
  };
  const remove = () => {
    if (!target) return;
    if (!inTail) {
      // drop the anchor and an empty pair of brackets around it
      const before = block.text.slice(0, target.from), after = block.text.slice(target.to);
      const open = before.match(/\s*\(\s*$/), shut = after.match(/^\s*\)/);
      replaceText(view, at, open ? target.from - open[0].length : target.from, shut ? target.to + shut[0].length : target.to, "");
    } else {
      const anchors = all.filter(a => a.from >= tail.tailFrom).filter((_, k) => k !== index - tailStart).map(a => parseAnchor(a.raw));
      replaceText(view, at, tail.text.replace(/\s+$/, "").length, block.text.length, formatTrailing(anchors));
    }
    close();
  };
  const open = () => {
    const path = resolved?.matter?.path ?? (resolved?.chapter && (resolved.chapter.authorPath ?? resolved.chapter.currentPath));
    if (!path) return;
    close();
    go(path, { find: target?.quote });
  };

  if (editing && editable) return <AnchorForm initial={target ? parseAnchor(target.raw) : undefined} onSave={save} onCancel={() => (isNew ? close() : setEditing(false))} onRemove={target ? remove : undefined} />;
  if (!target) return null;
  const c = resolved?.chapter;
  return (
    <div className="chip-view">
      <div className="chip-eyebrow">{anchorLabel(target)}</div>
      {target.offPage ? <p className="chip-text">Fixed for continuity, never stated in the chapters.</p> : target.matter ? (
        <>
          <div className="chip-title">{resolved?.matter?.name ?? anchorLabel(target)}</div>
          <div className="chip-sub">Outside the chapters</div>
          {target.quote && <blockquote className="chip-quote">“{target.quote}”</blockquote>}
        </>
      ) : (
        <>
          <div className="chip-title">{c ? `${c.number}. ${c.title || `Chapter ${c.number}`}` : "Missing chapter"}</div>
          {resolved?.sceneTitle && <div className="chip-sub">Scene {resolved.scene}: {resolved.sceneTitle}</div>}
          {target.quote && <blockquote className="chip-quote">“{target.quote}”</blockquote>}
        </>
      )}
      {resolved?.problem && <div className="chip-problem">{resolved.problem}</div>}
      <div className="chip-actions">
        {c && <button className="btn btn-sm" onClick={open}><Icon name="book" size={13} /> Open in the chapter</button>}
        {resolved?.matter && <button className="btn btn-sm" onClick={open}><Icon name="book" size={13} /> Open it</button>}
        <span className="tb-spacer" />
        {editable && <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="pen" size={13} /> Edit</button>}
      </div>
    </div>
  );
}

function scanFootnote(view: EditorView, id: string): { at: number; text: string } | null {
  let found: { at: number; text: string } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found || !node.isTextblock) return !found;
    const m = node.textContent.match(/^\[\^([^\]\s]+)\]:[ \t]*/);
    if (m && m[1] === id) found = { at: pos + 1, text: node.textContent.slice(m[0].length) };
    return false;
  });
  return found;
}

function FootnotePanel({ view, id, editable, close }: { view: EditorView; id: string; editable: boolean; close: () => void }) {
  const def = scanFootnote(view, id);
  const [text, setText] = useState(def?.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editable) ref.current?.focus(); }, [editable]);
  const save = () => {
    const current = scanFootnote(view, id);
    if (current) {
      const block = blockAt(view.state, current.at)!;
      const prefix = block.text.match(/^\[\^([^\]\s]+)\]:[ \t]*/)![0].length;
      replaceText(view, current.at, prefix, block.text.length, text.replace(/\n+/g, " ").trim());
    } else {
      const end = view.state.doc.content.size;
      const para = view.state.schema.nodes.paragraph.create(null, view.state.schema.text(`[^${id}]: ${text.replace(/\n+/g, " ").trim()}`));
      view.dispatch(view.state.tr.insert(end, para));
    }
    close();
  };
  const remove = () => {
    let tr = view.state.tr;
    const ranges: Array<[number, number]> = [];
    view.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      const t = node.textContent;
      const isDef = t.match(/^\[\^([^\]\s]+)\]:/)?.[1] === id;
      if (isDef) { ranges.push([pos, pos + node.nodeSize]); return false; }
      const { range, text: marked } = blockText(node, pos);
      for (const m of marked.matchAll(new RegExp(`\\[\\^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\](?!:)`, "g"))) ranges.push(range(m.index!, m.index! + m[0].length));
      return false;
    });
    for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) tr = tr.delete(a, b);
    view.dispatch(tr);
    close();
  };
  return (
    <div className="chip-view">
      <div className="chip-eyebrow">Footnote</div>
      {editable ? (
        <textarea ref={ref} className="chip-note" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="The note…"
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }} />
      ) : <p className="chip-text">{def?.text || "This footnote has no text yet."}</p>}
      {editable && (
        <div className="chip-actions">
          <button className="btn btn-sm btn-ghost danger" onClick={remove}>Delete footnote</button>
          <span className="tb-spacer" />
          <button className="btn btn-sm" onClick={close}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
        </div>
      )}
    </div>
  );
}

function SourcePicker({ onPick, onCancel }: { onPick: (item: CiteItem) => void; onCancel: () => void }) {
  const { list, loading } = useSources();
  const go = useBookStore(s => s.go);
  const [q, setQ] = useState("");
  const [locator, setLocator] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? list.filter(s => [s.id, s.title, ...(s.author ?? []).map(a => `${a.given ?? ""} ${a.family ?? a.literal ?? ""}`)].join(" ").toLowerCase().includes(t)) : list).slice(0, 30);
  }, [list, q]);
  return (
    <div className="chip-view">
      <div className="chip-eyebrow">Cite a source</div>
      <input className="chip-search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={loading ? "Loading sources…" : "Search author, title or key"} />
      <input className="chip-search" value={locator} onChange={e => setLocator(e.target.value)} placeholder="Page or passage (optional), e.g. 12 or Matt 6:7" />
      <div className="chip-list">
        {hits.map(s => (
          <button key={s.id} className="chip-list-item" onClick={() => onPick({ key: s.id, locator: locator.trim() || undefined })}>
            <span>{fullCite(s)}</span><code>@{s.id}</code>
          </button>
        ))}
        {!loading && !hits.length && <div className="muted chip-empty">{list.length ? "No source matches." : "This book has no sources yet."}</div>}
      </div>
      <div className="chip-actions">
        <button className="link-btn" onClick={() => { onCancel(); go("@sources", { view: "write" }); }}>Manage sources</button>
        <span className="tb-spacer" />
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CitePanel({ view, at, index, editable, close }: { view: EditorView; at: number; index: number; editable: boolean; close: () => void }) {
  const { byId } = useSources();
  const go = useBookStore(s => s.go);
  const block = blockAt(view.state, at);
  const match = block ? [...block.text.matchAll(new RegExp(CITATION.source, "g"))][index] : undefined;
  const [items, setItems] = useState<CiteItem[]>(() => (match ? parseCitation(match[0]) : []));
  const [adding, setAdding] = useState(false);
  if (!block || !match) return null;
  const save = (next = items) => {
    replaceText(view, at, match.index!, match.index! + match[0].length, next.length ? formatCitation(next) : "");
    close();
  };
  if (adding) return <SourcePicker onPick={item => { const next = [...items, item]; setItems(next); setAdding(false); }} onCancel={() => setAdding(false)} />;
  return (
    <div className="chip-view">
      <div className="chip-eyebrow">Citation</div>
      {items.map((it, k) => {
        const s = byId.get(it.key);
        return (
          <div key={k} className="cite-item">
            <div className="chip-text">{s ? fullCite(s) : <span className="chip-problem">@{it.key} is not in the book’s sources.</span>}</div>
            {editable ? (
              <div className="cite-item-row">
                <input className="chip-search" value={it.locator ?? ""} placeholder="Page or passage" onChange={e => setItems(items.map((x, j) => (j === k ? { ...x, locator: e.target.value || undefined } : x)))} />
                <button className="icon-btn" title="Remove this source" aria-label="Remove this source" onClick={() => setItems(items.filter((_, j) => j !== k))}><Icon name="close" size={13} /></button>
              </div>
            ) : it.locator ? <div className="chip-sub">{it.locator}</div> : null}
          </div>
        );
      })}
      <div className="chip-actions">
        <button className="link-btn" onClick={() => { close(); go("@sources", { view: "write", anchor: items[0]?.key }); }}>Open in sources</button>
        <span className="tb-spacer" />
        {editable && <button className="btn btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={13} /> Source</button>}
        {editable && <button className="btn btn-sm btn-primary" onClick={() => save()}>Save</button>}
      </div>
    </div>
  );
}

/** The popover for a chip in the editor: a chapter anchor, a footnote or a citation. */
export function ChipPopover() {
  const open = useChipPopover(s => s.open);
  const close = useChipPopover(s => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, open.rect.left));
    const below = open.rect.bottom + 8;
    const top = below + h > window.innerHeight - 12 ? Math.max(12, open.rect.top - h - 8) : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown, true); };
  }, [open, close]);

  if (!open) return null;
  const { mode, view, at, index, id, editable } = open;
  let body: React.ReactNode = null;
  if (mode === "anchor" || mode === "anchors" || mode === "new-anchor") body = <AnchorPanel view={view} at={at} index={index} editable={editable} isNew={mode === "new-anchor"} close={close} />;
  else if ((mode === "footnote" || mode === "note" || mode === "new-footnote") && id) body = <FootnotePanel view={view} id={id} editable={editable} close={close} />;
  else if (mode === "cite") body = <CitePanel view={view} at={at} index={index} editable={editable} close={close} />;
  else if (mode === "new-cite") body = <SourcePicker onCancel={close} onPick={item => { view.dispatch(view.state.tr.insertText(formatCitation([item]), at)); close(); view.focus(); }} />;
  return (
    <div ref={ref} className="chip-popover" role="dialog" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}>
      {body}
    </div>
  );
}
