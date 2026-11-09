import { useEffect, useMemo, useRef, useState } from "react";
import { columnKind, parseTable, rowNoun, serializeTable, type MdTable } from "../../lib/md-table";
import { findAnchors, parseAnchor } from "../../lib/anchors";
import { InlineMarkdown } from "./InlineMarkdown";
import { AnchorForm } from "./ChipPopover";
import { Icon } from "./common";

/** Decisions a copyeditor's style sheet usually settles (bookkit STANDARD.md). */
const STYLE_SHEET_KEYS = [
  "Spelling and dictionary", "Style manual", "Tense", "Point of view", "Dialogue punctuation", "Contractions",
  "Dashes", "Numbers", "Dates and times", "Italics", "Foreign words", "Names with special spellings",
];

function Grow({ value, onChange, onDone, label, autoFocus = true }: { value: string; onChange: (v: string) => void; onDone: () => void; label: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  useEffect(() => { if (autoFocus) { ref.current?.focus(); const n = ref.current?.value.length ?? 0; ref.current?.setSelectionRange(n, n); } }, [autoFocus]);
  return (
    <textarea ref={ref} rows={1} className="tbl-input" aria-label={label} value={value}
      onChange={e => onChange(e.target.value.replace(/\n/g, " "))}
      onBlur={onDone}
      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
  );
}

function TextCell({ value, editable, label, onChange, placeholder }: { value: string; editable: boolean; label: string; onChange: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  if (editing) return <Grow value={draft} label={label} onChange={setDraft} onDone={() => { setEditing(false); if (draft !== value) onChange(draft); }} />;
  return (
    <div className={`tbl-text ${editable ? "editable" : ""} ${value ? "" : "empty"}`} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}
      onClick={e => { if (editable && !(e.target as HTMLElement).closest(".anchor-chip,.cite-chip,a")) setEditing(true); }}
      onKeyDown={e => { if (editable && e.key === "Enter") { e.preventDefault(); setEditing(true); } }}>
      {value ? <InlineMarkdown text={value} /> : <span className="tbl-placeholder">{editable ? placeholder ?? "Add…" : ""}</span>}
    </div>
  );
}

function AnchorCell({ value, editable, onChange }: { value: string; editable: boolean; onChange: (v: string) => void }) {
  const anchors = useMemo(() => findAnchors(value), [value]);
  const rest = useMemo(() => value.replace(/\*Chs?\.[^*]*\*(?:\s*:\s*(?:“[^”]*”|"[^"]*"))?|\*off the page\*/g, "").replace(/[;\s]/g, ""), [value]);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const write = (list: string[]) => onChange(list.join("; "));
  if (rest) {
    // something other than anchors in the cell: edit it as text
    return <TextCell value={value} editable={editable} label="Anchor" onChange={onChange} />;
  }
  return (
    <div className="tbl-anchors">
      {anchors.map((a, i) => editing === i ? null : (
        <span key={i} className="tbl-anchor-wrap">
          <InlineMarkdown text={a.raw} />
          {editable && <button className="tbl-mini" title="Edit" aria-label="Edit reference" onClick={() => setEditing(i)}><Icon name="pen" size={11} /></button>}
        </span>
      ))}
      {editable && editing === null && <button className="tbl-add-chip" onClick={() => setEditing("new")}><Icon name="plus" size={11} /> Reference</button>}
      {editing !== null && (
        <div className="tbl-anchor-form">
          <AnchorForm
            initial={editing === "new" ? undefined : parseAnchor(anchors[editing].raw)}
            onCancel={() => setEditing(null)}
            onRemove={editing === "new" ? undefined : () => { write(anchors.filter((_, j) => j !== editing).map(a => a.raw)); setEditing(null); }}
            onSave={raw => { write(editing === "new" ? [...anchors.map(a => a.raw), raw] : anchors.map((a, j) => (j === editing ? raw : a.raw))); setEditing(null); }}
          />
        </div>
      )}
    </div>
  );
}

function ChoiceCell({ value, options, editable, onChange }: { value: string; options: string[]; editable: boolean; onChange: (v: string) => void }) {
  const bare = value.replace(/[*_]/g, "").trim();
  if (!editable) return <span className={`tbl-pill v-${bare}`}>{bare}</span>;
  return (
    <select className={`tbl-pill-select v-${bare}`} value={bare} onChange={e => onChange(e.target.value)} aria-label="Label">
      {!bare && <option value="">Choose…</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function RowMenu({ index, count, onMove, onDelete }: { index: number; count: number; onMove: (by: -1 | 1) => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="tbl-row-menu">
      <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Move up" aria-label="Move up"><Icon name="down" size={13} /></button>
      <button className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down" aria-label="Move down"><Icon name="down" size={13} /></button>
      {confirm
        ? <span className="confirm-inline"><button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button><button className="btn btn-sm" onClick={() => setConfirm(false)}>Keep</button></span>
        : <button className="icon-btn" onClick={() => setConfirm(true)} title="Delete" aria-label="Delete"><Icon name="close" size={13} /></button>}
    </div>
  );
}

/** A Markdown table edited as records. Two-column tables read as key and value. */
export function TableEditor({ source, editable, onChange, onAddSection }: { source: string; editable: boolean; onChange: (source: string) => void; onAddSection?: (title: string, header: string) => void }) {
  const table = useMemo(() => parseTable(source), [source]);
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [adding, setAdding] = useState(false);
  const [sectionName, setSectionName] = useState<string | null>(null);
  if (!table) return <pre className="raw-md">{source}</pre>;
  const cols = table.header.length;
  const kinds = table.header.map((h, i) => columnKind(h, table.rows.map(r => r.cells[i] ?? "")));
  const noun = rowNoun(table.header);
  const keyValue = cols === 2 && kinds.every(k => k.kind === "text");
  // Wide tables (a claim ledger) read better as one card per row.
  const cards = !keyValue && (cols >= 5 || (narrow && cols >= 3));
  const styleSheet = keyValue && /decision/i.test(table.header[0]);
  const sectioned = /^facts?$/i.test(table.header[0].replace(/[*_]/g, "").trim());
  const commit = (next: MdTable) => onChange(serializeTable(next));
  const setCell = (r: number, c: number, v: string) => commit({ ...table, rows: table.rows.map((row, i) => (i === r ? { ...row, cells: row.cells.map((x, j) => (j === c ? v : x)) } : row)) });
  const move = (r: number, by: -1 | 1) => {
    const rows = [...table.rows];
    const [it] = rows.splice(r, 1);
    rows.splice(r + by, 0, it);
    commit({ ...table, rows });
  };
  const remove = (r: number) => commit({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  const add = (first = "") => {
    const cells = table.header.map((_, i) => (i === 0 ? first : kinds[i].kind === "choice" ? (kinds[i].options?.[kinds[i].options!.length > 3 ? 3 : 0] ?? "") : ""));
    commit({ ...table, rows: [...table.rows, { cells }] });
    setAdding(false);
  };
  const missingKeys = styleSheet ? STYLE_SHEET_KEYS.filter(k => !table.rows.some(r => r.cells[0].toLowerCase().startsWith(k.toLowerCase().split(" ")[0]))) : [];

  const cell = (r: number, c: number) => {
    const v = table.rows[r].cells[c] ?? "";
    const k = kinds[c];
    if (k.kind === "anchor") return <AnchorCell value={v} editable={editable} onChange={x => setCell(r, c, x)} />;
    if (k.kind === "choice") return <ChoiceCell value={v} options={k.options ?? []} editable={editable} onChange={x => setCell(r, c, x)} />;
    return <TextCell value={v} editable={editable} label={table.header[c]} onChange={x => setCell(r, c, x)} placeholder={`Add ${table.header[c].replace(/[*_]/g, "").toLowerCase()}`} />;
  };

  return (
    <div ref={box} className={`tbl ${keyValue ? "tbl-kv" : cards ? "tbl-cardset" : "tbl-grid"}`} contentEditable={false}>
      {keyValue ? (
        <div className="tbl-kv-list">
          <div className="tbl-kv-head"><span>{table.header[0]}</span><span>{table.header[1]}</span></div>
          {table.rows.map((row, r) => (
            <div key={r} className="tbl-kv-row">
              <div className="tbl-kv-key">{cell(r, 0)}</div>
              <div className="tbl-kv-val">{cell(r, 1)}</div>
              {editable && <RowMenu index={r} count={table.rows.length} onMove={by => move(r, by)} onDelete={() => remove(r)} />}
            </div>
          ))}
        </div>
      ) : cards ? (
        <div className="tbl-cards">
          {table.rows.map((row, r) => (
            <article key={r} className="tbl-card">
              <header className="tbl-card-head">
                <div className={`tbl-card-title${/^(id|key|#|no\.?)$/i.test(table.header[0].replace(/[*_]/g, "").trim()) ? " is-id" : ""}`}>{cell(r, 0)}</div>
                {kinds.map((k, c) => (c > 0 && k.kind !== "text" ? <div key={c} className={`tbl-card-meta k-${k.kind}`}>{cell(r, c)}</div> : null))}
                {editable && <RowMenu index={r} count={table.rows.length} onMove={by => move(r, by)} onDelete={() => remove(r)} />}
              </header>
              <dl className="tbl-card-fields">
                {table.header.map((h, c) => (c > 0 && kinds[c].kind === "text" ? (
                  <div key={c} className="tbl-card-field"><dt><InlineMarkdown text={h} /></dt><dd>{cell(r, c)}</dd></div>
                ) : null))}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl-table">
            <thead><tr>{table.header.map((h, i) => <th key={i} className={`k-${kinds[i].kind}`}><InlineMarkdown text={h} /></th>)}</tr></thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {table.header.map((_, c) => (
                    <td key={c} className={`k-${kinds[c].kind}${c === cols - 1 ? " tbl-last" : ""}`}>
                      {cell(r, c)}
                      {editable && c === cols - 1 && <RowMenu index={r} count={table.rows.length} onMove={by => move(r, by)} onDelete={() => remove(r)} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <div className="tbl-foot">
          {adding && missingKeys.length > 0 ? (
            <div className="tbl-suggest">
              {missingKeys.map(k => <button key={k} className="chip" onClick={() => add(k)}>{k}</button>)}
              <button className="chip" onClick={() => add("")}>Something else</button>
              <button className="link-btn" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button className="tbl-add" onClick={() => (missingKeys.length ? setAdding(true) : add())}><Icon name="plus" size={13} /> Add {noun}</button>
          )}
          {onAddSection && sectioned && sectionName === null && <button className="link-btn tbl-add-section" onClick={() => setSectionName("")}>New section</button>}
          {onAddSection && sectioned && sectionName !== null && (
            <form className="tbl-section-form" onSubmit={e => { e.preventDefault(); if (sectionName.trim()) { onAddSection(sectionName.trim(), `${table.headerRaw}\n${table.alignRaw}`); setSectionName(null); } }}>
              <input autoFocus value={sectionName} onChange={e => setSectionName(e.target.value)} placeholder="Section title, e.g. Places and distances" />
              <button className="btn btn-sm btn-primary" type="submit" disabled={!sectionName.trim()}>Add section</button>
              <button className="btn btn-sm" type="button" onClick={() => setSectionName(null)}>Cancel</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
