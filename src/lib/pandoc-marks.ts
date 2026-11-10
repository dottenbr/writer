/**
 * Pandoc markup that stays in the text but should read quietly: the `| ` that
 * starts each line of a line block (verse, addresses) and citations like
 * `[@lutherbibel1912, Matt 6:7]`.
 */
export type MarkKind = "line" | "cite";

export const CITATION = /\[(?:[^\][@]*[\s;])?-?@\w[\w:.#$%&+?<>~/-]*[^\][]*\]/g;

/** Where the marks are in `text`; lines are separated by "\n". */
export function pandocMarks(text: string): Array<{ from: number; to: number; kind: MarkKind }> {
  const out: Array<{ from: number; to: number; kind: MarkKind }> = [];
  for (const m of text.matchAll(/(^|\n)\| /g)) {
    const from = m.index! + m[1].length;
    out.push({ from, to: from + 2, kind: "line" });
  }
  for (const m of text.matchAll(CITATION)) out.push({ from: m.index!, to: m.index! + m[0].length, kind: "cite" });
  return out.sort((a, b) => a.from - b.from);
}

export const MARK_CLASS: Record<MarkKind, string> = { line: "md-line-mark", cite: "md-cite" };
