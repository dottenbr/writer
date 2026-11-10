/**
 * Markdown (GFM) tables as records: parse, edit cell by cell, write back with
 * every untouched row byte-for-byte as it was.
 */

export interface TableRow { cells: string[]; raw?: string }
export interface MdTable {
  header: string[];
  headerRaw: string;
  alignRaw: string;
  rows: TableRow[];
}

export function isTableSource(source: string): boolean {
  const lines = source.trim().split("\n");
  return lines.length >= 2 && /^\s*\|/.test(lines[0]) && /^\s*\|?\s*:?-{2,}/.test(lines[1]);
}

export function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === "|") { cur += "\\|"; i++; continue; }
    if (ch === "`") code = !code;
    if (ch === "|" && !code) { cells.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseTable(source: string): MdTable | null {
  if (!isTableSource(source)) return null;
  const lines = source.replace(/\s+$/, "").split("\n");
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).filter(l => l.trim()).map(raw => {
    const cells = splitRow(raw);
    while (cells.length < header.length) cells.push("");
    return { cells: cells.slice(0, Math.max(header.length, cells.length)), raw };
  });
  return { header, headerRaw: lines[0], alignRaw: lines[1], rows };
}

const cellText = (c: string) => c.replace(/\r?\n+/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();

export function formatRow(cells: string[]): string {
  return `| ${cells.map(cellText).join(" | ")} |`;
}

export function serializeTable(t: MdTable): string {
  const rows = t.rows.map(r => (r.raw !== undefined && sameCells(splitRow(r.raw), r.cells) ? r.raw : formatRow(r.cells)));
  return [t.headerRaw, t.alignRaw, ...rows].join("\n");
}

function sameCells(a: string[], b: string[]) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if ((a[i] ?? "") !== (b[i] ?? "")) return false;
  return true;
}

export type ColumnKind = "anchor" | "choice" | "text";

/** Values a labeled column is expected to hold (bookkit STANDARD.md). */
const VOCAB: Array<{ header: RegExp; values: string[] }> = [
  { header: /^labels?$/i, values: ["documented", "testimony", "inferred", "invented"] },
  { header: /^status$/i, values: ["verified-primary", "verified-secondary", "unverified", "contradicted"] },
];

export function columnKind(header: string, values: string[]): { kind: ColumnKind; options?: string[] } {
  const h = header.replace(/[*_`]/g, "").trim();
  if (/^anchors?$/i.test(h)) return { kind: "anchor" };
  const vocab = VOCAB.find(v => v.header.test(h));
  if (vocab) {
    const extra = [...new Set(values.map(v => v.replace(/[*_]/g, "").trim()).filter(v => v && !vocab.values.includes(v) && v.length < 40))];
    return { kind: "choice", options: [...vocab.values, ...extra] };
  }
  return { kind: "text" };
}

/** "Fact" → "fact", "Decision" → "decision": what one row is called. */
export function rowNoun(header: string[]): string {
  const first = (header[0] ?? "").replace(/[*_`]/g, "").trim().toLowerCase();
  if (!first || first.length > 24) return "row";
  return first.replace(/s$/, "");
}
