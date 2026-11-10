import { useEffect, useMemo } from "react";
import { useBookStore } from "../../store/useBookStore";
import { resolveAnchor, type Anchor } from "../../lib/anchors";
import { bibliographyPath, fullCite, parseSources, shortCite, type CiteItem, type Source } from "../../lib/bibliography";

const parsedCache = new Map<string, { content: string; list: Source[]; byId: Map<string, Source> }>();

/** The book's bibliography, parsed once per version. Works outside React too. */
export function sourcesNow(): { path: string; list: Source[]; byId: Map<string, Source>; loaded: boolean } {
  const s = useBookStore.getState();
  const path = bibliographyPath(s.model?.config);
  const file = s.files.find(f => f.path === path);
  const content = file?.content ?? "";
  let hit = parsedCache.get(path);
  if (!hit || hit.content !== content) {
    const list = parseSources(content);
    hit = { content, list, byId: new Map(list.map(x => [x.id, x])) };
    parsedCache.set(path, hit);
  }
  return { path, list: hit.list, byId: hit.byId, loaded: !!file?.loaded || !file };
}

/** A citation item as a chip shows it. */
export function citeLabel(item: CiteItem): { short: string; full?: string; known: boolean } {
  const { byId } = sourcesNow();
  const source = byId.get(item.key);
  return { short: `${item.prefix ? item.prefix + " " : ""}${shortCite(source, item.key, item.locator)}`, full: source ? fullCite(source) : undefined, known: !!source };
}

export function useSources() {
  const config = useBookStore(s => s.model?.config);
  const path = bibliographyPath(config);
  const file = useBookStore(s => s.files.find(f => f.path === path));
  const ensureLoaded = useBookStore(s => s.ensureLoaded);
  useEffect(() => { if (file && !file.loaded) void ensureLoaded(path); }, [file, path, ensureLoaded]);
  return useMemo(() => {
    const list = parseSources(file?.content ?? "");
    return { path, file, list, byId: new Map(list.map(x => [x.id, x])), loading: !!file && !file.loaded };
  }, [file, path]);
}

/** What read-only views need to draw anchor and citation chips. */
export function staticChipContext() {
  const s = useBookStore.getState();
  const byPath = new Map(s.files.map(f => [f.path, f]));
  return {
    resolve: (a: Anchor) => resolveAnchor(a, s.model?.chapters ?? [], p => { const f = byPath.get(p); return f && f.loaded !== false ? f.content : undefined; }),
    cite: citeLabel,
  };
}
