/**
 * The editor's chips for read-only HTML (chapters not being edited, the context
 * panel, scene cards): anchors beside their facts, footnote numbers, short cites.
 */
import { anchorLabel, factQuotes, MATTER_WORDS, parseAnchor, type Anchor, type ResolvedAnchor } from "./anchors";
import { parseCitation, type CiteItem } from "./bibliography";
import { CITATION } from "./pandoc-marks";

export interface StaticChipContext {
  resolve?: (a: Anchor) => ResolvedAnchor;
  cite?: (item: CiteItem) => { short: string; full?: string; known: boolean };
}

const LIST = String.raw`\d+(?:\s*(?:[–-]|,|and|&amp;|&)\s*\d+)*`;
const REF = String.raw`Chs?\.\s+${LIST}(?:,\s*Scenes?\s+${LIST})?`;
const MATTER = String.raw`(?:${MATTER_WORDS.replace("['’]", "(?:'|’|&#39;)")}|(?:Front|Back) matter:\s+[^<\n]+?)`;
const EM = String.raw`<em>(?:(?:${REF}(?:\s*(?:;|,|and)\s*${REF})*)\.?|${MATTER})</em>`;
const QUOTE = String.raw`(?:\s*:\s*(?:“[^”<\n]+”|&quot;(?:(?!&quot;)[^<\n])+&quot;))`;
const ONE = String.raw`(?:${EM}${QUOTE}?|<em>off the page</em>)`;
const TAIL = new RegExp(String.raw`\s*\(\s*(${ONE}(?:\s*;\s*${ONE})*)\s*\)[.;,]?(?=\s*(?:</p>|</li>|</td>|<ul|<ol|<br|$))`, "g");
const ANY = new RegExp(ONE, "g");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const rawOf = (html: string) => unesc(html.replace(/<\/?em>/g, "*").replace(/&#39;/g, "'"));
const notAnchor = (html: string, ctx: StaticChipContext) => {
  const a = parseAnchor(rawOf(html));
  return !!a.matter && ctx.resolve?.(a)?.status === "not-anchor";
};

function chip(html: string, ctx: StaticChipContext, quotes?: string[] | null): string {
  const raw = rawOf(html);
  const parsed = parseAnchor(raw);
  const a = quotes && !parsed.quote && !parsed.matter ? { ...parsed, factQuotes: quotes } : parsed;
  const r = ctx.resolve?.(a);
  if (a.matter && r?.status === "not-anchor") return html;
  const where = r?.matter ? `${r.matter.name} (outside the chapters)` : r?.chapter ? `Chapter ${r.chapter.number}${r.chapter.title ? `: ${r.chapter.title}` : ""}${r.scene ? ` · Scene ${r.scene}${r.sceneTitle ? `: ${r.sceneTitle}` : ""}` : ""}` : "";
  const quoted = a.quote ? `“${a.quote}”` : a.factQuotes ? a.factQuotes.map(q => `“${q}”`).join(" ") : "";
  const title = [where, quoted, r?.problem ?? ""].filter(Boolean).join("\n");
  return `<span class="anchor-chip ${r?.status ?? "ok"}${quoted ? " has-quote" : ""}" data-anchor="${esc(raw)}" title="${esc(title)}">${esc(anchorLabel(a))}</span>`;
}

/** The text of the fact a trailing anchor run closes: from its block's start to the run. */
function factBefore(html: string, offset: number): string {
  const head = html.slice(0, offset);
  const start = Math.max(head.lastIndexOf("<li>"), head.lastIndexOf("<p>"), head.lastIndexOf("<td>"), head.lastIndexOf("<li "), head.lastIndexOf("<br"), 0);
  return unesc(head.slice(start).replace(/<strong>([^<]*:)<\/strong>/g, "**$1**").replace(/<[^>]+>/g, "").replace(/&#39;/g, "'"));
}

/** Apply `fn` to the text between tags only. */
function textOnly(html: string, fn: (text: string) => string): string {
  return html.split(/(<[^>]+>)/).map((part, i) => (i % 2 ? part : fn(part))).join("");
}

export function staticChips(html: string, ctx: StaticChipContext): string {
  let out = html;
  if (out.includes("<em>")) {
    out = out.replace(TAIL, (whole, group: string, offset: number, all: string) => {
      const items = [...group.matchAll(ANY)].map(m => m[0]);
      if (items.some(m => notAnchor(m, ctx))) return whole;
      const quotes = items.every(m => !/:\s*(?:“|&quot;)/.test(m)) ? factQuotes(factBefore(all, offset)) : null;
      return `<span class="anchor-chips">${items.map(m => chip(m, ctx, quotes)).join("")}</span>`;
    });
    out = out.replace(ANY, m => chip(m, ctx));
  }
  if (out.includes("[^")) {
    const order = new Map<string, number>();
    const notes = new Map<string, string>();
    for (const m of out.matchAll(/<p>\[\^([^\]\s]+)\]:[ \t]*([\s\S]*?)<\/p>/g)) notes.set(m[1], m[2].replace(/<[^>]+>/g, ""));
    for (const m of out.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) if (!order.has(m[1])) order.set(m[1], order.size + 1);
    for (const id of notes.keys()) if (!order.has(id)) order.set(id, order.size + 1);
    out = out.replace(/<p>\[\^([^\]\s]+)\]:[ \t]*/g, (_m, id) => `<p class="fn-def"><span class="fn-num">${order.get(id)}</span>`);
    out = textOnly(out, t => t.replace(/\[\^([^\]\s]+)\](?!:)/g, (_m, id) => `<sup class="fn-ref" title="${esc(unesc(notes.get(id) ?? ""))}">${order.get(id)}</sup>`));
  }
  if (out.includes("@")) {
    out = textOnly(out, t => t.replace(new RegExp(CITATION.source, "g"), m => {
      const items = parseCitation(unesc(m));
      const cites = items.map(i => ctx.cite?.(i) ?? { short: `@${i.key}`, known: false });
      const title = cites.map(c => c.full ?? "").filter(Boolean).join("\n\n");
      return `<span class="cite-chip${cites.every(c => c.known) ? "" : " unknown"}" title="${esc(title)}">${esc(cites.map(c => c.short).join("; "))}</span>`;
    }));
  }
  return out;
}
