import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { parseBookkit } from "../src/lib/bookkit";

const root = resolve(process.argv[2] ?? ".");
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(entries.filter(e => !e.name.startsWith(".")).map(e => e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)])));
  return paths.flat();
}
const paths = await walk(root);
for (const config of paths.filter(p => p.endsWith("/book.yaml"))) {
  const dir = config.slice(0, -"/book.yaml".length);
  const sources = paths.filter(p => p.startsWith(dir + "/") && /\.(md|yaml|yml|json|bib|txt)$/.test(p));
  const files = Object.fromEntries(await Promise.all(sources.map(async p => [relative(dir, p), await readFile(p, "utf8")])));
  const book = parseBookkit(files);
  console.log(JSON.stringify({ book: relative(root, dir), title: book.config.title, layout: book.config.manuscript.layout, chapters: book.chapters.length, authorChapters: book.chapters.filter(c => c.author).length, referenceChapters: book.chapters.filter(c => c.reference).length, documents: book.documents.length, frontMatter: book.frontMatter.length, backMatter: book.backMatter.length }));
}
