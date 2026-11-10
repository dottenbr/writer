import { parse } from "yaml";

export interface BookkitDocument {
  path: string;
  raw: string;
  metadata: Record<string, unknown>;
  body: string;
  metadataError?: string;
}
export interface BookkitChapter {
  number: number;
  author?: BookkitDocument;
  reference?: BookkitDocument;
  current: BookkitDocument;
  currentSource: "author" | "reference";
}
export interface BookkitBook {
  config: Record<string, any>;
  chapters: BookkitChapter[];
  documents: BookkitDocument[];
  frontMatter: BookkitDocument[];
  backMatter: BookkitDocument[];
}

function safePath(path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").some(p => p === ".." || p === ".")) {
    throw new Error(`Unsafe book path: ${path}`);
  }
  return path;
}

function document(path: string, raw: string): BookkitDocument {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let metadata: Record<string, unknown> = {};
  let metadataError: string | undefined;
  try { metadata = match ? parse(match[1]) : {}; }
  catch (error) { metadataError = String(error); }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error(`Invalid metadata: ${path}`);
  return { path, raw, metadata, metadataError, body: match ? raw.slice(match[0].length) : raw };
}

/** Pure, lossless import model. Reference prose is never promoted to author prose. */
export function parseBookkit(files: Record<string, string>): BookkitBook {
  for (const path of Object.keys(files)) safePath(path);
  if (!files["book.yaml"]) throw new Error("Missing book.yaml");
  const config = parse(files["book.yaml"]);
  if (!config?.title || !config?.manuscript?.dir) throw new Error("book.yaml needs title and manuscript.dir");
  const layout = config.manuscript.layout ?? "flat";
  if (layout !== "flat" && layout !== "parts") throw new Error(`Unsupported layout: ${layout}`);
  const documents = Object.entries(files).map(([path, raw]) => document(path, raw));
  const readChapters = (dir?: string) => {
    const result = new Map<number, BookkitDocument>();
    if (!dir) return result;
    const prefix = safePath(dir) + "/";
    for (const doc of documents) {
      if (!doc.path.startsWith(prefix) || !doc.path.endsWith(".md")) continue;
      const relative = doc.path.slice(prefix.length);
      if (relative === "README.md") continue;
      const pattern = layout === "flat" ? /^\d{2}-[a-z0-9-]+\.md$/ : /^\d{2}-[a-z0-9-]+\/\d{2}-[a-z0-9-]+\.md$/;
      if (!pattern.test(relative)) throw new Error(`Invalid chapter path: ${doc.path}`);
      if (doc.metadataError) throw new Error(`Invalid chapter metadata: ${doc.path}: ${doc.metadataError}`);
      const number = doc.metadata.chapter;
      if (!Number.isInteger(number) || Number(number) < 1 || Number(relative.split("/").pop()!.slice(0, 2)) !== number) throw new Error(`Invalid chapter number: ${doc.path}`);
      if (result.has(Number(number))) throw new Error(`Duplicate chapter ${number} in ${dir}`);
      if ((!config.manuscript.untitled_chapters && typeof doc.metadata.title !== "string") || typeof doc.metadata.status !== "string") throw new Error(`Missing chapter title/status: ${doc.path}`);
      result.set(Number(number), doc);
    }
    return result;
  };
  const authors = readChapters(config.manuscript.dir);
  const references = readChapters(config.manuscript.draft);
  const numbers = [...new Set([...authors.keys(), ...references.keys()])].sort((a, b) => a - b);
  const chapters = numbers.map(number => {
    const author = authors.get(number);
    const reference = references.get(number);
    const currentSource = author && (author.metadata.status !== "drafting" || !reference) ? "author" as const : "reference" as const;
    return { number, author, reference, current: (currentSource === "author" ? author : reference)!, currentSource };
  });
  const matter = (names: string[] = []) => names.map(name => {
    safePath(name);
    const doc = documents.find(d => d.path === name);
    if (!doc) throw new Error(`Missing publication matter: ${name}`);
    return doc;
  });
  return { config, chapters, documents, frontMatter: matter(config.publication?.front_matter), backMatter: matter(config.publication?.back_matter) };
}
