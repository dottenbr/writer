/**
 * A timeline page: "## Period" sections, each with a table of events
 * (When | What | Anchor …). Read as a vertical timeline; edits rewrite only
 * the row or section they touch.
 */
import { slugify } from "./book-model";

export interface TimelineEvent { cells: string[]; line: number }
export interface TimelinePeriod {
  slug: string;
  title: string;
  intro: string;
  header: string[];
  events: TimelineEvent[];
  /** Line of the heading, and line just after the table (where a new row goes). */
  headingLine: number;
  insertLine: number;
  hasTable: boolean;
}
export interface Timeline { intro: string; periods: TimelinePeriod[] }

export function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") { cell += "|"; i++; }
    else if (inner[i] === "|") { cells.push(cell.trim()); cell = ""; }
    else cell += inner[i];
  }
  cells.push(cell.trim());
  return cells;
}

export const joinRow = (cells: string[]) => `| ${cells.map(c => c.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()).join(" | ")} |`;
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);

export function parseTimeline(text: string): Timeline {
  const lines = text.split("\n");
  let i = 0;
  if (lines[0] === "---") { i = 1; while (i < lines.length && lines[i] !== "---") i++; i++; }
  const periods: TimelinePeriod[] = [];
  const intro: string[] = [];
  let current: TimelinePeriod | null = null;
  let fence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^## /.test(line)) {
      const title = line.slice(3).trim();
      current = { slug: slugify(title), title, intro: "", header: [], events: [], headingLine: i, insertLine: i + 1, hasTable: false };
      periods.push(current);
      continue;
    }
    if (!current) { if (!/^# /.test(line)) intro.push(line); continue; }
    if (!fence && isRow(line) && !current.hasTable) {
      if (isRule(lines[i + 1] ?? "")) {
        current.header = splitRow(line);
        current.hasTable = true;
        i++;
        current.insertLine = i + 1;
        while (i + 1 < lines.length && isRow(lines[i + 1])) { i++; current.events.push({ cells: splitRow(lines[i]), line: i }); current.insertLine = i + 1; }
        continue;
      }
    }
    if (!current.hasTable && line.trim()) current.intro += (current.intro ? "\n" : "") + line;
  }
  return { intro: intro.join("\n").trim(), periods };
}

/** Which column holds what. */
export function columns(header: string[]) {
  const find = (re: RegExp) => header.findIndex(h => re.test(h));
  const when = Math.max(0, find(/^(when|date|time|day|year|season)/i));
  let what = find(/^(what|event|happens|description)/i);
  if (what < 0) what = header.length > 1 ? (when === 0 ? 1 : 0) : 0;
  const anchor = find(/^(anchor|source|where in|chapters?|ref)/i);
  return { when, what, anchor };
}

const replaceLines = (text: string, from: number, count: number, insert: string[]) => {
  const lines = text.split("\n");
  lines.splice(from, count, ...insert);
  return lines.join("\n");
};

export function updateEvent(text: string, period: string, index: number, cells: string[]): string {
  const p = parseTimeline(text).periods.find(x => x.slug === period);
  const e = p?.events[index];
  return e ? replaceLines(text, e.line, 1, [joinRow(cells)]) : text;
}

export function removeEvent(text: string, period: string, index: number): string {
  const p = parseTimeline(text).periods.find(x => x.slug === period);
  const e = p?.events[index];
  return e ? replaceLines(text, e.line, 1, []) : text;
}

export function moveEvent(text: string, period: string, index: number, by: -1 | 1): string {
  const p = parseTimeline(text).periods.find(x => x.slug === period);
  const a = p?.events[index], b = p?.events[index + by];
  if (!a || !b) return text;
  const lines = text.split("\n");
  [lines[a.line], lines[b.line]] = [lines[b.line], lines[a.line]];
  return lines.join("\n");
}

export const DEFAULT_HEADER = ["When", "What", "Anchor"];

export function addEvent(text: string, period: string, cells: string[]): string {
  const p = parseTimeline(text).periods.find(x => x.slug === period);
  if (!p) return text;
  if (p.hasTable) return replaceLines(text, p.insertLine, 0, [joinRow(cells)]);
  const header = DEFAULT_HEADER;
  const lines = text.split("\n");
  // after the period's intro text
  let at = p.headingLine + 1;
  while (at < lines.length && !/^#{1,2} /.test(lines[at])) at++;
  while (at > p.headingLine + 1 && !lines[at - 1].trim()) at--;
  return replaceLines(text, at, 0, ["", joinRow(header), joinRow(header.map(() => "---")), joinRow(cells)]);
}

export function addPeriod(text: string, title: string): string {
  return text.replace(/\s*$/, "") + `\n\n## ${title.trim()}\n\n${joinRow(DEFAULT_HEADER)}\n${joinRow(DEFAULT_HEADER.map(() => "---"))}\n`;
}

export function renamePeriod(text: string, period: string, title: string): string {
  const p = parseTimeline(text).periods.find(x => x.slug === period);
  return p ? replaceLines(text, p.headingLine, 1, [`## ${title.trim()}`]) : text;
}

/** A page reads as a timeline when its periods hold event tables. */
export const isTimeline = (text: string) => parseTimeline(text).periods.some(p => p.hasTable);
