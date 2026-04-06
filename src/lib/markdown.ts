import { marked } from "marked";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

export function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

export function estimatePages(wordCount: number): number {
  return Math.max(0, Math.round(wordCount / 250));
}

export function kFormatWords(value: number): string {
  if (value < 1000) return `${value}`;
  return `${(value / 1000).toFixed(1)}k`;
}
