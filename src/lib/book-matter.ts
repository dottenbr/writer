/**
 * The parts of a book outside its chapters that an anchor may name, as bookkit
 * finds them (companion.py `matter_texts`):
 *
 *   *Afterword*, *Book description*, *About the author*   the `sections:` of the publication metadata
 *   *Back matter: Reading Gilead*, *Front matter: Preface*   files listed in `publication`, by title
 *
 * A listed file can also be named by its bare title when that is a matter word
 * (*Preface*, *Acknowledgements*).
 */
import { parse as parseYaml } from "yaml";
import type { MatterPart } from "./anchors";
import { splitDocument } from "./markdown-doc";

interface FileLike { path: string; content: string; loaded?: boolean }

const SECTION_NAMES: Record<string, string> = { copyright: "copyright page", about_author: "about the author" };

export const matterKey = (name: string) => name.replace(/’/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

const cache = new WeakMap<object, { key: string; map: Map<string, MatterPart> }>();

/** name → part, for one book's files and book.yaml. */
export function matterParts(files: FileLike[], config: Record<string, any> | undefined): Map<string, MatterPart> {
  const pub = config?.publication ?? {};
  const metaPath: string = typeof pub.metadata === "string" ? pub.metadata : "publication/metadata.yaml";
  const lists: Array<[string, unknown]> = [["front", pub.front_matter], ["back", pub.back_matter]];
  const byPath = new Map(files.map(f => [f.path, f]));
  const wanted = [metaPath, ...lists.flatMap(([, l]) => (Array.isArray(l) ? l.map(String) : []))];
  const key = wanted.map(p => { const f = byPath.get(p); return `${p}:${f?.loaded === false ? "-" : f?.content.length ?? "x"}:${f?.content.slice(0, 40) ?? ""}`; }).join("|");
  const hit = cache.get(files);
  if (hit && hit.key === key) return hit.map;

  const map = new Map<string, MatterPart>();
  const meta = byPath.get(metaPath);
  if (meta && meta.loaded !== false) {
    let data: any = null;
    try { data = parseYaml(meta.content); } catch { data = null; }
    const sections = data && typeof data === "object" ? data.sections : null;
    if (sections && typeof sections === "object") {
      for (const [k, body] of Object.entries(sections)) {
        if (typeof body !== "string") continue;
        const name = SECTION_NAMES[k] ?? k.replace(/_/g, " ").toLowerCase();
        map.set(matterKey(name), { name: name[0].toUpperCase() + name.slice(1), path: metaPath, text: body });
      }
    }
  }
  for (const [side, list] of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list.map(String)) {
      const f = byPath.get(p);
      if (!f) continue;
      const loaded = f.loaded !== false;
      const doc = loaded ? splitDocument(f.content) : null;
      const title = String(doc?.metadata.title ?? p.split("/").pop()!.replace(/\.md$/, "").replace(/^\d+-/, "").replace(/-/g, " "));
      const part: MatterPart = { name: title, path: p, text: doc ? doc.body : undefined };
      map.set(matterKey(`${side} matter: ${title}`), part);
      if (!map.has(matterKey(title))) map.set(matterKey(title), part);
    }
  }
  cache.set(files, { key, map });
  return map;
}

/** A lookup for `resolveAnchor`. */
export function matterLookup(files: FileLike[], config: Record<string, any> | undefined) {
  const map = matterParts(files, config);
  return (name: string) => map.get(matterKey(name));
}

/** The parts an anchor picker offers, each with the name its anchor is written with. */
export function matterChoices(files: FileLike[], config: Record<string, any> | undefined): Array<{ anchor: string; part: MatterPart }> {
  const out: Array<{ anchor: string; part: MatterPart }> = [];
  const seen = new Set<MatterPart>();
  for (const [key, part] of matterParts(files, config)) {
    if (seen.has(part)) continue;
    const listed = /^(front|back) matter: /.exec(key);
    if (part.path.endsWith(".md") && !listed) continue; // the bare-title alias of a listed file
    seen.add(part);
    out.push({ anchor: listed ? `${listed[1] === "front" ? "Front" : "Back"} matter: ${part.name}` : part.name, part });
  }
  return out;
}
