/**
 * Reordering chapters in a Bookkit book.
 *
 * A chapter's number lives in its file name, its front matter, its H1, its
 * scene-card file and every "Ch. N" anchor in the companion files. This plans
 * every change needed to move chapters as one consistent edit; nothing here
 * touches prose beyond those numbers.
 */
import { CHAPTER_ANCHOR, anchorNumbers, type BookModel } from "./book-model";
import { setFrontMatterField, splitDocument } from "./markdown-doc";

export interface ReorderPlan {
  /** Files to create or overwrite, keyed by path. */
  writes: Array<{ path: string; content: string }>;
  /** Paths to delete after the writes succeed. */
  deletes: string[];
  /** Old chapter number → new chapter number (only those that change). */
  mapping: Map<number, number>;
  /** Files whose path changes, old → new. */
  moves: Array<{ from: string; to: string }>;
  warnings: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function withNumber(path: string, n: number) {
  const parts = path.split("/");
  parts[parts.length - 1] = parts[parts.length - 1].replace(/^\d{2}/, pad(n));
  return parts.join("/");
}

/** Render a set of chapter numbers the way bookkit anchors are written: "Ch. 3", "Chs. 1–2, 5". */
export function formatAnchor(prefix: string, numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  const word = /^Chapter/i.test(prefix) ? (sorted.length > 1 ? "Chapters" : "Chapter") : sorted.length > 1 ? "Chs." : "Ch.";
  return `${word} ${runs.join(", ")}`;
}

export function renumberAnchors(text: string, mapping: Map<number, number>): string {
  return text.replace(CHAPTER_ANCHOR, (match, list: string) => {
    const nums = anchorNumbers(list);
    if (!nums.some(n => mapping.has(n))) return match;
    const prefix = match.slice(0, match.length - list.length).trim();
    return formatAnchor(prefix, nums.map(n => mapping.get(n) ?? n));
  });
}

/**
 * `order` lists the current chapter numbers in their new order
 * (e.g. [1, 3, 2, 4] swaps chapters 2 and 3).
 */
export function planReorder(model: BookModel, files: Array<{ path: string; content: string; loaded?: boolean; asset?: unknown }>, order: number[]): ReorderPlan {
  const current = model.chapters.map(c => c.number);
  if (order.length !== current.length || [...order].sort((a, b) => a - b).join() !== [...current].sort((a, b) => a - b).join()) {
    throw new Error("The new order must contain every chapter exactly once.");
  }
  const slots = [...current].sort((a, b) => a - b);
  const mapping = new Map<number, number>();
  order.forEach((old, i) => { if (slots[i] !== old) mapping.set(old, slots[i]); });
  const plan: ReorderPlan = { writes: [], deletes: [], mapping, moves: [], warnings: [] };
  if (!mapping.size) return plan;

  if (model.config?.manuscript?.layout === "parts") {
    for (const c of model.chapters) {
      const target = mapping.get(c.number);
      if (target == null) continue;
      const dest = model.chapters.find(x => x.number === target);
      if (dest?.part?.key !== c.part?.key) throw new Error("Chapters can only be reordered within their part.");
    }
  }

  const byPath = new Map(files.map(f => [f.path, f]));
  const written = new Map<string, string>();
  const write = (path: string, content: string) => written.set(path, content);
  const touched = new Set<string>();

  for (const c of model.chapters) {
    const to = mapping.get(c.number);
    if (to == null) continue;
    for (const path of [c.authorPath, c.referencePath, c.scenesPath]) {
      if (!path) continue;
      const file = byPath.get(path);
      if (!file) continue;
      let content = setFrontMatterField(file.content, "chapter", to);
      const split = splitDocument(content);
      if (split.titleBlock) {
        const renamed = split.titleBlock
          .replace(new RegExp(`^# Chapter ${c.number}\\b`), `# Chapter ${to}`)
          .replace(new RegExp(`^# ${c.number}(?=[.:\\s]|$)`), `# ${to}`);
        content = split.frontMatter + split.lead + renamed + split.body;
      }
      if (path === c.scenesPath) content = renumberAnchors(content, mapping);
      const dest = withNumber(path, to);
      if (dest !== path) {
        plan.moves.push({ from: path, to: dest });
        plan.deletes.push(path);
      }
      write(dest, content);
      touched.add(path);
    }
  }

  // The chapter outline: renumber headings and put the sections in the new order.
  const outline = byPath.get("outline/chapters.md");
  if (outline) {
    let content = outline.content;
    const lines = content.split("\n");
    const starts: Array<{ line: number; n: number }> = [];
    lines.forEach((l, i) => { const m = l.match(/^## (\d+)(?=[.:\s]|$)/); if (m) starts.push({ line: i, n: Number(m[1]) }); });
    const ends = starts.map((s, i) => {
      for (let j = s.line + 1; j < lines.length; j++) if (/^#{1,2} /.test(lines[j])) return j;
      return lines.length;
    });
    const fileOrder = starts.map(s => s.n);
    const complete = fileOrder.join() === slots.filter(n => fileOrder.includes(n)).join() && fileOrder.length === slots.length;
    const block = (i: number) => lines.slice(starts[i].line, ends[i]);
    const renumbered = (i: number) => {
      const b = block(i);
      const n = starts[i].n;
      const to = mapping.get(n) ?? n;
      b[0] = b[0].replace(/^## \d+/, `## ${to}`);
      return b;
    };
    if (complete) {
      // slot k (the k-th section in the file) receives the chapter that now holds number slots[k]
      const sourceIndexFor = (newNumber: number) => {
        const old = [...mapping.entries()].find(([, v]) => v === newNumber)?.[0] ?? newNumber;
        return starts.findIndex(s => s.n === old);
      };
      const out: string[] = [];
      let cursor = 0;
      starts.forEach((s, k) => {
        out.push(...lines.slice(cursor, s.line));
        out.push(...renumbered(sourceIndexFor(slots[k])));
        cursor = ends[k];
      });
      out.push(...lines.slice(cursor));
      content = out.join("\n");
    } else {
      plan.warnings.push("The chapter outline doesn’t have one section per chapter, so its headings were renumbered but not reordered.");
      starts.forEach((s, i) => { const to = mapping.get(s.n); if (to != null) lines[s.line] = lines[s.line].replace(/^## \d+/, `## ${to}`); void i; });
      content = lines.join("\n");
    }
    content = renumberAnchors(content, mapping);
    if (content !== outline.content) write(outline.path, content);
    touched.add(outline.path);
  }

  // Anchors everywhere else that describes the book.
  for (const f of files) {
    if (touched.has(f.path) || f.asset || f.loaded === false || !f.path.endsWith(".md")) continue;
    if (!/^(bible|outline|craft|research)\//.test(f.path) && f.path !== "README.md") continue;
    const next = renumberAnchors(f.content, mapping);
    if (next !== f.content) write(f.path, next);
  }

  const destinations = new Set(written.keys());
  for (const { from, to } of plan.moves) {
    if (byPath.has(to) && !plan.deletes.includes(to)) throw new Error(`Another file is already called ${to}; rename it first.`);
    void from;
  }
  plan.deletes = plan.deletes.filter(p => !destinations.has(p));
  plan.writes = [...written.entries()].map(([path, content]) => ({ path, content }));
  return plan;
}
