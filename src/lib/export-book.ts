import { marked, type Token, type Tokens } from "marked";
import type { BookModel } from "./book-model";
import { splitDocument } from "./markdown-doc";

interface Run { text: string; bold?: boolean; italics?: boolean; strike?: boolean }

function runs(tokens: Token[] | undefined, style: Omit<Run, "text"> = {}): Run[] {
  const out: Run[] = [];
  for (const t of tokens ?? []) {
    if (t.type === "strong") out.push(...runs((t as Tokens.Strong).tokens, { ...style, bold: true }));
    else if (t.type === "em") out.push(...runs((t as Tokens.Em).tokens, { ...style, italics: true }));
    else if (t.type === "del") out.push(...runs((t as Tokens.Del).tokens, { ...style, strike: true }));
    else if (t.type === "link") out.push(...runs((t as Tokens.Link).tokens, style));
    else if (t.type === "text" && (t as Tokens.Text).tokens) out.push(...runs((t as Tokens.Text).tokens, style));
    else if (t.type === "br") out.push({ text: "\n", ...style });
    else out.push({ text: ((t as any).text ?? t.raw ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\[\^[^\]]+\]/g, ""), ...style });
  }
  return out;
}

/** A clean reading copy of the manuscript as it stands: your chapters, and the draft where you haven't written yet. */
export async function exportManuscriptDocx(model: BookModel, files: Array<{ path: string; content: string }>, opts: { authorOnly: boolean }) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak } = await import("docx");
  const content = (p?: string) => (p ? files.find(f => f.path === p)?.content ?? "" : "");
  const children: any[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 3000, after: 400 }, children: [new TextRun({ text: model.title, size: 56, font: "Georgia" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.author, size: 28, font: "Georgia", italics: true })] }),
  ];
  for (const c of model.chapters) {
    const path = opts.authorOnly ? (c.authorPath && (!c.started || !c.referencePath) ? c.authorPath : undefined) : c.currentPath;
    if (!path) continue;
    const { body, metadata } = splitDocument(content(path));
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 200 }, children: [new TextRun({ text: `Chapter ${c.number}`, size: 22, font: "Georgia", allCaps: true })] }));
    const title = String(metadata.title ?? c.title ?? "");
    if (title) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: title, size: 36, font: "Georgia" })] }));
    let first = true;
    for (const t of marked.lexer(body)) {
      if (t.type === "space") continue;
      if (t.type === "hr") { children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: "* * *", font: "Georgia" })] })); first = true; continue; }
      const toks = t.type === "blockquote" ? (t as Tokens.Blockquote).tokens.flatMap(x => (x as any).tokens ?? []) : (t as any).tokens;
      if (t.type === "list") {
        for (const item of (t as Tokens.List).items) children.push(new Paragraph({ bullet: { level: 0 }, children: runs(item.tokens.flatMap(x => (x as any).tokens ?? [x])).map(r => new TextRun({ ...r, font: "Georgia", size: 24 })) }));
        continue;
      }
      const rs = runs(toks ?? [t]);
      children.push(new Paragraph({
        spacing: { line: 360 },
        indent: t.type === "blockquote" ? { left: 720 } : first || t.type === "heading" ? undefined : { firstLine: 360 },
        children: rs.map(r => new TextRun({ ...r, font: "Georgia", size: t.type === "heading" ? 28 : 24, bold: r.bold || t.type === "heading" })),
      }));
      first = t.type === "heading";
    }
  }
  const doc = new Document({ creator: model.author, title: model.title, sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.title.replace(/[^\w\s-]/g, "").trim() || "manuscript"}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The manuscript as one Markdown file (or plain text), in chapter order. */
export function manuscriptText(model: BookModel, files: Array<{ path: string; content: string }>, opts: { authorOnly: boolean; plain: boolean }): string {
  const out: string[] = [opts.plain ? model.title.toUpperCase() : `# ${model.title}`, opts.plain ? model.author : `*${model.author}*`, ""];
  for (const c of model.chapters) {
    const path = opts.authorOnly ? (c.authorPath && (!c.started || !c.referencePath) ? c.authorPath : undefined) : c.currentPath;
    if (!path) continue;
    const { body, metadata } = splitDocument(files.find(f => f.path === path)?.content ?? "");
    const title = String(metadata.title ?? c.title ?? "");
    out.push(opts.plain ? `\n\nCHAPTER ${c.number}${title ? `\n${title}` : ""}\n` : `\n## ${c.number}. ${title}\n`);
    let text = body.trim();
    if (opts.plain) {
      text = text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*(\*\s*\*\s*\*|\*\*\*|---)\s*$/gm, "        *")
        .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\\([*_`[\]#>-])/g, "$1");
    }
    out.push(text);
  }
  return out.join("\n") + "\n";
}

export function exportManuscriptText(model: BookModel, files: Array<{ path: string; content: string }>, opts: { authorOnly: boolean; plain: boolean }) {
  const name = (model.title.replace(/[^\w\s-]/g, "").trim() || "manuscript") + (opts.plain ? ".txt" : ".md");
  download(new Blob([manuscriptText(model, files, opts)], { type: opts.plain ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8" }), name);
}
