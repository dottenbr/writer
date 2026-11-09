/**
 * Markdown <-> rich-text bridge for Bookkit documents.
 *
 * The editor works on HTML/ProseMirror; the book stays Markdown with YAML
 * front matter. Untouched blocks are written back byte-for-byte, so editing
 * one paragraph never reformats the rest of a chapter or companion file.
 */
import { marked, type Token, type Tokens } from "marked";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Footnote definitions (`[^1]: The note.`) are paragraphs, not link definitions:
// otherwise a one-word note turns every `[^1]` into a link to that word.
marked.use({ tokenizer: { def(src: string) { return /^ {0,3}\[\^/.test(src) ? undefined : false; } } as never });

export interface JSONNode {
  type: string;
  attrs?: Record<string, any>;
  content?: JSONNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

export interface SplitDocument {
  /** Front matter including the `---` fences and the newline after them ("" if none). */
  frontMatter: string;
  metadata: Record<string, unknown>;
  /** A leading `# ...` heading line, kept verbatim (with trailing blank lines). */
  titleBlock: string;
  title: string;
  /** Leading whitespace of the body before the first block. */
  lead: string;
  /** Markdown after the front matter and title. */
  body: string;
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function splitDocument(raw: string): SplitDocument {
  const match = raw.match(FRONT);
  const frontMatter = match ? match[0] : "";
  let metadata: Record<string, unknown> = {};
  if (match) {
    try {
      const parsed = parseYaml(match[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
    } catch {
      /* invalid metadata stays raw */
    }
  }
  let rest = raw.slice(frontMatter.length);
  const lead = rest.match(/^\s*/)?.[0] ?? "";
  rest = rest.slice(lead.length);
  let titleBlock = "";
  let title = "";
  const heading = rest.match(/^# (.*)(?:\r?\n|$)(?:[ \t]*\r?\n)*/);
  if (heading) {
    titleBlock = heading[0];
    title = heading[1].trim();
    rest = rest.slice(titleBlock.length);
  }
  return { frontMatter, metadata, titleBlock, title, lead, body: rest };
}

export function joinDocument(doc: SplitDocument, body: string): string {
  return doc.frontMatter + doc.lead + doc.titleBlock + body;
}

/** Replace, add, or remove (when value is null/undefined) one top-level key in the front matter, keeping every other line as written. */
export function setFrontMatterField(raw: string, key: string, value: string | number | null | undefined): string {
  const match = raw.match(FRONT);
  if (value === null || value === undefined || value === "") {
    if (!match) return raw;
    const lines = match[1].split(/\r?\n/);
    const index = lines.findIndex(l => new RegExp(`^${key}\\s*:`).test(l));
    if (index < 0) return raw;
    let end = index + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
    lines.splice(index, end - index);
    const nl = match[0].includes("\r\n") ? "\r\n" : "\n";
    const fence = match[0].endsWith("\n") ? nl : "";
    return `---${nl}${lines.join(nl)}${nl}---${fence}` + raw.slice(match[0].length);
  }
  const line = stringifyYaml({ [key]: value }).trimEnd();
  if (!match) return `---\n${line}\n---\n\n${raw}`;
  const lines = match[1].split(/\r?\n/);
  const index = lines.findIndex(l => new RegExp(`^${key}\\s*:`).test(l));
  if (index >= 0) {
    let end = index + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
    lines.splice(index, end - index, line);
  } else lines.push(line);
  const nl = match[0].includes("\r\n") ? "\r\n" : "\n";
  const fence = match[0].endsWith("\n") ? nl : "";
  return `---${nl}${lines.join(nl)}${nl}---${fence}` + raw.slice(match[0].length);
}

// ───────────────────────── Markdown → HTML ─────────────────────────

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Allow only http(s), mailto, and scheme-less relative/anchor links; block javascript:/data:/vbscript:. */
export function isSafeHref(href: string): boolean {
  const normalized = href.replace(/[\u0000-\u001F\u007F-\u009F\s]+/g, "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    return /^(?:https?|mailto):/i.test(normalized);
  }
  return !normalized.startsWith("//");
}

export function safeHref(href: string): string {
  return isSafeHref(href) ? href : "#";
}

function inline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(t => {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) return inline(tt.tokens);
        return textWithBreaks(tt.text);
      }
      case "escape": return escapeHtml((t as Tokens.Escape).text);
      case "strong": return `<strong>${inline((t as Tokens.Strong).tokens)}</strong>`;
      case "em": return `<em>${inline((t as Tokens.Em).tokens)}</em>`;
      case "del": return `<s>${inline((t as Tokens.Del).tokens)}</s>`;
      case "codespan": return `<code>${escapeHtml(decodeEntities((t as Tokens.Codespan).text))}</code>`;
      case "br": return "<br>";
      case "link": {
        const l = t as Tokens.Link;
        return `<a href="${escapeHtml(safeHref(l.href))}"${l.title ? ` title="${escapeHtml(l.title)}"` : ""}>${inline(l.tokens)}</a>`;
      }
      case "image": return escapeHtml(t.raw);
      case "html": return escapeHtml(t.raw);
      default: return escapeHtml(t.raw ?? "");
    }
  }).join("");
}

/** marked HTML-escapes text tokens; undo that so we control escaping. */
function decodeEntities(s: string) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function textWithBreaks(text: string) {
  return escapeHtml(decodeEntities(text)).replace(/\n/g, '<br data-soft="1">');
}

function block(t: Token): string {
  switch (t.type) {
    case "paragraph": return `<p>${inline((t as Tokens.Paragraph).tokens)}</p>`;
    case "heading": {
      const h = t as Tokens.Heading;
      return `<h${h.depth}>${inline(h.tokens)}</h${h.depth}>`;
    }
    case "blockquote": {
      const q = t as Tokens.Blockquote;
      return `<blockquote>${q.tokens.filter(x => x.type !== "space").map(block).join("")}</blockquote>`;
    }
    case "list": {
      const l = t as Tokens.List;
      if (l.items.some(item => item.task)) {
        return `<div data-raw-md="${escapeHtml(t.raw.replace(/\s+$/, ""))}"></div>`;
      }
      const tag = l.ordered ? "ol" : "ul";
      const start = l.ordered && l.start !== 1 && l.start !== "" ? ` start="${l.start}"` : "";
      const items = l.items.map(item => {
        const inner = item.tokens.filter(x => x.type !== "space" && x.type !== "checkbox").map(x =>
          x.type === "text" ? `<p>${inline((x as Tokens.Text).tokens ?? [x])}</p>` : block(x)).join("");
        return `<li>${inner || "<p></p>"}</li>`;
      }).join("");
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case "hr": return `<hr data-markup="${escapeHtml(t.raw.trim())}">`;
    case "code": {
      const c = t as Tokens.Code;
      return `<pre><code${c.lang ? ` class="language-${escapeHtml(c.lang)}"` : ""}>${escapeHtml(c.text)}</code></pre>`;
    }
    case "text": return `<p>${inline((t as Tokens.Text).tokens ?? [t])}</p>`;
    default:
      return `<div data-raw-md="${escapeHtml(t.raw.replace(/\s+$/, ""))}"></div>`;
  }
}

export interface ParsedBody {
  html: string;
  /** Verbatim source of each top-level block, including the whitespace after it. */
  blocks: string[];
  /** Whitespace before the first block. */
  prefix: string;
  /** False when the blocks do not reproduce the source exactly; edit such text as Markdown. */
  lossless: boolean;
}

export function markdownToHtml(body: string): ParsedBody {
  const tokens = marked.lexer(body);
  const blocks: string[] = [];
  const html: string[] = [];
  let prefix = "";
  for (const t of tokens) {
    if (t.type === "space" || t.type === "def") {
      if (t.type === "def") {
        // link definitions are kept as their own raw block
        html.push(block({ ...t, type: "rawdef" } as unknown as Token));
        blocks.push(t.raw);
        continue;
      }
      if (blocks.length) blocks[blocks.length - 1] += t.raw;
      else prefix += t.raw;
      continue;
    }
    html.push(block(t));
    blocks.push(t.raw);
  }
  const lossless = prefix + blocks.join("") === body && !/^\s*\[[^\]^]+\]:\s/m.test(body);
  return { html: html.join(""), blocks, prefix, lossless };
}

/** Plain HTML rendering for read-only views (outline cards, previews). */
export function renderMarkdown(markdown: string): string {
  return markdownToHtml(markdown).html;
}

// ───────────────────────── ProseMirror JSON → Markdown ─────────────────────────

const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];

function escapeText(text: string, atLineStart: boolean): string {
  let out = text
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/`/g, "\\`")
    .replace(/(^|[^\p{L}\p{N}])_|_(?=[^\p{L}\p{N}]|$)/gu, (m) => m.replace("_", "\\_"));
  if (atLineStart) out = out
    .replace(/^(\s*)(#{1,6}\s|>|[-+]\s)/, (_, s, m) => s + "\\" + m)
    .replace(/^(\s*\d+)([.)])(\s|$)/, "$1\\$2$3");
  return out;
}

function sameMarks(a?: JSONNode["marks"], b?: JSONNode["marks"]) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function wrap(text: string, marks: NonNullable<JSONNode["marks"]>): string {
  if (!marks.length || !text) return text;
  const lead = text.match(/^\s*/)![0];
  const trail = text.slice(lead.length).match(/\s*$/)![0];
  let core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  const sorted = [...marks].sort((a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type));
  for (const m of sorted) {
    if (m.type === "bold") core = `**${core}**`;
    else if (m.type === "italic") core = `*${core}*`;
    else if (m.type === "strike") core = `~~${core}~~`;
    else if (m.type === "link") core = `[${core}](${m.attrs?.href ?? ""}${m.attrs?.title ? ` "${m.attrs.title}"` : ""})`;
  }
  return lead + core + trail;
}

function inlineMd(nodes: JSONNode[] = [], blockStart = true): string {
  // merge adjacent text nodes with identical marks
  const merged: JSONNode[] = [];
  for (const n of nodes) {
    const last = merged[merged.length - 1];
    if (n.type === "text" && last?.type === "text" && sameMarks(last.marks, n.marks)) last.text = (last.text ?? "") + (n.text ?? "");
    else merged.push({ ...n });
  }
  let out = "";
  for (const n of merged) {
    if (n.type === "hardBreak") { out += n.attrs?.soft ? "\n" : "\\\n"; continue; }
    if (n.type !== "text") continue;
    const marks = n.marks ?? [];
    const code = marks.some(m => m.type === "code");
    const atLineStart = (blockStart && out === "") || out.endsWith("\n");
    let text: string;
    if (code) {
      const fence = (n.text ?? "").includes("`") ? "``" : "`";
      text = wrap(fence + (n.text ?? "") + fence, marks.filter(m => m.type !== "code"));
    } else text = wrap(escapeText(n.text ?? "", atLineStart), marks);
    out += text;
  }
  return out;
}

function indent(text: string, pad: string) {
  return text.split("\n").map((l, i) => (i === 0 || !l ? l : pad + l)).join("\n");
}

export function nodeToMarkdown(node: JSONNode): string {
  switch (node.type) {
    case "paragraph": return inlineMd(node.content);
    case "heading": return "#".repeat(node.attrs?.level ?? 2) + " " + inlineMd(node.content, false);
    case "blockquote":
      return (node.content ?? []).map(nodeToMarkdown).join("\n\n").split("\n").map(l => (l ? "> " + l : ">")).join("\n");
    case "bulletList":
      return (node.content ?? []).map(item => "- " + indent((item.content ?? []).map(nodeToMarkdown).join("\n\n"), "  ")).join("\n");
    case "orderedList": {
      const start = node.attrs?.start ?? 1;
      return (node.content ?? []).map((item, i) => {
        const marker = `${start + i}. `;
        return marker + indent((item.content ?? []).map(nodeToMarkdown).join("\n\n"), " ".repeat(marker.length));
      }).join("\n");
    }
    case "horizontalRule": return node.attrs?.markup || "* * *";
    case "codeBlock": {
      const text = (node.content ?? []).map(c => c.text ?? "").join("");
      return "```" + (node.attrs?.language ?? "") + "\n" + text + "\n```";
    }
    case "rawBlock": return node.attrs?.source ?? "";
    default: return inlineMd(node.content);
  }
}

/**
 * Serialize an edited document. `original` pairs each block's canonical
 * serialization (as first loaded) with its verbatim source; unchanged blocks
 * reuse their source so diffs stay minimal.
 */
export function docToMarkdown(doc: JSONNode, original?: { canonical: string[]; blocks: string[]; prefix: string }): string {
  const nodes = (doc.content ?? []).filter(n => !(n.type === "paragraph" && !n.content?.length));
  const lastIndex = (original?.blocks.length ?? 0) - 1;
  const pool = new Map<string, number[]>();
  if (original) original.canonical.forEach((c, i) => {
    const list = pool.get(c) ?? [];
    list.push(i);
    pool.set(c, list);
  });
  // which original block (if any) each node reuses
  const md = nodes.map(nodeToMarkdown);
  const used = md.map(m => pool.get(m)?.shift() ?? -1);
  let out = original?.prefix ?? "";
  nodes.forEach((_, i) => {
    const last = i === nodes.length - 1;
    if (used[i] >= 0 && original && used[i] < original.blocks.length) {
      let raw = original.blocks[used[i]];
      // Original adjacency keeps the original separator; anything else gets a clean blank line.
      const keepsNeighbour = last ? used[i] === lastIndex : used[i + 1] === used[i] + 1;
      if (!keepsNeighbour) raw = raw.replace(/\s*$/, "") + (last ? "\n" : "\n\n");
      out += raw;
    } else {
      out += md[i] + (last ? "\n" : "\n\n");
    }
  });
  if (out && !out.endsWith("\n")) out += "\n";
  return out;
}

/** Plain text of a markdown body, for word counts and mention scanning. */
export function markdownToPlain(markdown: string): string {
  return markdown
    .replace(FRONT, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]:?/g, "")
    .replace(/[*_`~>|]/g, "")
    .replace(/^\s*[-+]\s+/gm, "");
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}
