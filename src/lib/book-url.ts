/**
 * Readable URLs for the Studio, so the address bar follows what you click and
 * the browser's back and forward buttons work.
 *
 *   /the-owl-at-dusk                         title page
 *   /the-owl-at-dusk/chapter/2               chapter 2
 *   /the-owl-at-dusk/chapter/2/plan          its plan and scene cards
 *   /the-owl-at-dusk/plan                    plan board
 *   /the-owl-at-dusk/brief                   brief
 *   /the-owl-at-dusk/outline/chapters        a plan page
 *   /the-owl-at-dusk/bible                   story bible overview
 *   /the-owl-at-dusk/bible/characters        character cards
 *   /the-owl-at-dusk/bible/characters/nora   one character
 *   /the-owl-at-dusk/bible/characters/full-page   the whole characters page
 *   /the-owl-at-dusk/craft/style-guide       any other page
 *   /the-owl-at-dusk/inspiration, /settings
 *
 * A heading to scroll to travels in the hash.
 */
import { entityKindForPath, slugify, type BookModel } from "./book-model";

const chapterForPath = (chapters: BookModel["chapters"], path: string) => chapters.find(c => c.authorPath === path || c.referencePath === path);

export type StudioView = "write" | "plan" | "bible" | "inspiration" | "settings";

export interface Route {
  view: StudioView;
  path: string;
  anchor?: string;
}

/** The whole-page view of a bible file whose sections are shown as cards. */
export const FULL_PAGE = "@page";

/** Which view a document belongs to. */
export function viewForPath(path: string): StudioView {
  if (path === "@brief" || path.startsWith("outline/")) return "plan";
  if (path.startsWith("bible/")) return "bible";
  return "write";
}

export function bookSlug(catalog: Array<{ id: string; name: string }>, id: string): string {
  const book = catalog.find(b => b.id === id);
  if (!book) return id;
  const slug = slugify(book.name);
  return catalog.filter(b => slugify(b.name) === slug).length > 1 ? `${slug}-${id.slice(0, 8)}` : slug;
}

export function bookIdForSlug(catalog: Array<{ id: string; name: string }>, slug: string): string | undefined {
  if (!slug) return undefined;
  return catalog.find(b => bookSlug(catalog, b.id) === slug || b.id === slug)?.id;
}

/** The first path segment of the current address: the book. */
export function urlBookSlug(pathname = window.location.pathname): string {
  return decodeURIComponent(pathname.split("/").filter(Boolean)[0] ?? "");
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export function routeToUrl(book: string, route: Route, model: BookModel): string {
  const base = "/" + encodeURIComponent(book);
  const hash = (anchor?: string) => (anchor ? "#" + encodeURIComponent(anchor) : "");
  const { view, path, anchor } = route;
  if (view === "inspiration" || view === "settings") return `${base}/${view}`;
  if (path === "@brief") return `${base}/brief`;
  if (!path) return view === "write" ? base : `${base}/${view}`;
  const chapter = chapterForPath(model.chapters, path);
  if (chapter) return `${base}/chapter/${chapter.number}${hash(anchor)}`;
  const scenes = path.match(/^outline\/scenes\/(\d+)[^/]*\.md$/);
  if (scenes) {
    const owner = model.chapters.find(c => c.scenesPath === path) ?? model.chapters.find(c => c.number === Number(scenes[1]));
    if (owner) return `${base}/chapter/${owner.number}/plan${hash(anchor)}`;
  }
  const page = path.replace(/\.md$/i, "");
  const known = model.companions.some(d => d.path === path) || model.entities.some(e => e.path === path);
  const prefix = known && /\.md$/i.test(path) ? encodePath(page) : "file/" + encodePath(path);
  if (view === "bible" && entityKindForPath(path)) {
    if (anchor === FULL_PAGE) return `${base}/${prefix}/full-page`;
    if (anchor) return `${base}/${prefix}/${encodeURIComponent(anchor)}`;
  }
  return `${base}/${prefix}${hash(anchor)}`;
}

/** Resolve an address (without the book segment) against the open book. */
export function urlToRoute(pathname: string, hash: string, model: BookModel): Route | null {
  const parts = pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
  const anchor = hash ? decodeURIComponent(hash.replace(/^#/, "")) || undefined : undefined;
  if (!parts.length) return { view: "write", path: "" };
  const [head, ...rest] = parts;
  if (head === "inspiration" || head === "settings") return { view: head, path: "" };
  if (head === "plan" && !rest.length) return { view: "plan", path: "" };
  if (head === "bible" && !rest.length) return { view: "bible", path: "" };
  if (head === "brief") return { view: "plan", path: "@brief" };
  if (head === "chapter") {
    const chapter = model.chapters.find(c => c.number === Number(rest[0]));
    if (chapter && (rest[1] === "plan" || rest[1] === "scenes")) return { view: "plan", path: chapter.scenesPath ?? `outline/scenes/${String(chapter.number).padStart(2, "0")}-${slugify(chapter.title || "chapter")}.md`, anchor };
    return chapter ? { view: "write", path: chapter.authorPath ?? chapter.currentPath, anchor } : { view: "write", path: "" };
  }
  if (head === "file") {
    const path = rest.join("/");
    return { view: viewForPath(path), path, anchor };
  }
  const exists = (p: string) => model.companions.some(d => d.path === p) || model.entities.some(e => e.path === p);
  const full = parts.join("/");
  const asMd = full.endsWith(".md") ? full : full + ".md";
  const chapterByPath = chapterForPath(model.chapters, asMd);
  if (chapterByPath) return { view: "write", path: chapterByPath.authorPath ?? chapterByPath.currentPath, anchor };
  if (exists(asMd)) return { view: viewForPath(asMd), path: asMd, anchor };
  // bible/<page>/<entity> or bible/<page>/full-page
  if (head === "bible" && parts.length >= 3) {
    const path = parts.slice(0, -1).join("/") + ".md";
    const last = parts[parts.length - 1];
    if (entityKindForPath(path) && exists(path)) return { view: "bible", path, anchor: last === "full-page" ? FULL_PAGE : last };
  }
  return null;
}

/** Resolve a relative Markdown href (`../bible/characters.md#nora`, `02-japan.md`, `#part`) against `currentPath`. */
export function resolveInternalHref(href: string, currentPath: string, model: BookModel): Route | null {
  const [file, hash] = href.split("#");
  const base = currentPath.split("/").slice(0, -1);
  for (const part of file.split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  const resolved = file ? base.join("/") : currentPath;
  const chapter = chapterForPath(model.chapters, resolved);
  if (chapter || model.companions.some(d => d.path === resolved)) {
    return { view: viewForPath(resolved), path: resolved, anchor: hash || undefined };
  }
  return null;
}

/** Format the browser tab title (`document.title`) for the active book and Studio view. */
export function studioDocumentTitle(
  bookTitle: string | undefined,
  model: BookModel | null,
  view: StudioView,
  path: string,
  anchor?: string,
  visibleChapter?: number
): string {
  const title = (model?.title || bookTitle || "").trim();
  if (!title) return "Bookkit";
  if (!model) return `${title} · Bookkit`;

  let sub: string | undefined;
  if (view === "inspiration") {
    sub = "Inspiration";
  } else if (view === "settings") {
    sub = "Settings";
  } else if (path === "@brief") {
    sub = "Brief";
  } else if (view === "plan" && !path) {
    sub = "Plan";
  } else if (view === "bible" && !path) {
    sub = "Story bible";
  } else if (view === "plan" && path.startsWith("outline/scenes/")) {
    const num = Number(path.match(/(\d+)[^/]*\.md$/)?.[1]);
    const ch = model.chapters.find(c => c.scenesPath === path) ?? model.chapters.find(c => c.number === num);
    sub = ch ? `Ch. ${ch.number} Plan` : "Chapter plan";
  } else if (view === "bible" && entityKindForPath(path) && anchor && anchor !== FULL_PAGE) {
    const ent = model.entities.find(e => e.path === path && e.slug === anchor);
    sub = ent?.name ?? model.companions.find(d => d.path === path)?.title;
  } else if (view === "write" && (path === "" || chapterForPath(model.chapters, path))) {
    const ch = path
      ? ((visibleChapter ? model.chapters.find(c => c.number === visibleChapter) : undefined) ?? chapterForPath(model.chapters, path))
      : (visibleChapter ? model.chapters.find(c => c.number === visibleChapter) : undefined);
    if (ch) sub = ch.title ? `Ch. ${ch.number} · ${ch.title}` : `Chapter ${ch.number}`;
  } else if (path) {
    sub = model.companions.find(d => d.path === path)?.title;
  }

  return sub ? `${title} · ${sub} · Bookkit` : `${title} · Bookkit`;
}

export function openInNewTab(url: string): void {
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Opening a book from the workspace: go to where you left off, not the title page. */
export const navFlags = { openLastPlace: false, openInNewTab: false };
