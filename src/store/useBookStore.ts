import { create } from "zustand";
import { listBookDocuments, readBookDocument, refreshBookDocuments, type BookDocumentRow } from "../lib/supabase-service";
import { readStored, writeStored } from "../lib/local-cache";
import { useAuthStore } from "./useAuthStore";
import { subscribeBookActivity, readBookReview, type Suggestion, type Thread } from "../lib/bookkit-collaboration";
import { buildBookModel, type BookModel } from "../lib/book-model";
import { supabase } from "../lib/supabase-client";
import { bookSlug, navFlags, openInNewTab, routeToUrl, viewForPath, type Route, type StudioView } from "../lib/book-url";
import { useProjectStore } from "./useProjectStore";

export type View = StudioView;

export interface Location {
  /** Document path, or "" for the book overview. */
  path: string;
  /** Heading slug or entity slug to scroll to. */
  anchor?: string;
  /** Text to find and flash after navigating. */
  find?: string;
  /** Monotonic counter so repeated navigation to the same place still scrolls. */
  nonce: number;
}

interface BookState {
  projectId: string | null;
  files: BookDocumentRow[];
  model: BookModel | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  live: string;
  view: View;
  location: Location;
  /** path → open thread count */
  openThreads: Record<string, number>;
  /** path → pending suggestion count */
  pendingSuggestions: Record<string, number>;
  /** path → bumped when threads/suggestions change */
  reviewVersion: Record<string, number>;
  selectedEntity: string | null;
  panel: string;
  panelOpen: boolean;
  focusMode: boolean;
  visibleChapter?: number;
  /** Words added to your own chapters today, in this browser. */
  wordsToday: number;
  activeThread?: string;
  setActiveThread: (id: string | undefined) => void;
  reviews: Record<string, { suggestions: Suggestion[]; threads: Thread[] }>;
  setVisibleChapter: (n: number | undefined) => void;
  loadReview: (path: string) => Promise<void>;
  load: (projectId: string) => Promise<void>;
  /** Download what changed since the files in memory were fetched. */
  revalidate: () => Promise<void>;
  unload: () => void;
  refreshPath: (path: string) => Promise<BookDocumentRow | null>;
  upsert: (row: BookDocumentRow) => void;
  drop: (path: string) => void;
  ensureLoaded: (path: string) => Promise<BookDocumentRow | null>;
  refreshReviewCounts: () => Promise<void>;
  setView: (view: View) => void;
  go: (path: string, opts?: { anchor?: string; find?: string; view?: View }) => void;
  /** Show a route from the address bar (back/forward, reload, shared link). */
  applyRoute: (route: Route) => void;
  selectEntity: (id: string | null) => void;
  setPanel: (panel: string, open?: boolean) => void;
  togglePanel: () => void;
  setFocusMode: (on: boolean) => void;
}

let stopActivity: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let nonce = 0;
let lastWritePath = "";
/** Only manuscript places (title page, chapters, front and back matter) are remembered for the Manuscript button. */
const isManuscriptPlace = (path: string) => path === "" || !path.startsWith("@") && !/^(craft|research|bible|outline|publication)\//.test(path) && !/^[^/]+\.(md|ya?ml)$/i.test(path);

/** Books opened in this tab, so switching back is instant. */
const memoryCache = new Map<string, BookDocumentRow[]>();
const cacheKey = (projectId: string) => `files:${useAuthStore.getState().userId ?? "anon"}:${projectId}`;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function remember(projectId: string, files: BookDocumentRow[], delay = 1500) {
  memoryCache.set(projectId, files);
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { persistTimer = null; void writeStored(cacheKey(projectId), files); }, delay);
}
/** Forget books cached in this tab (sign-out). */
export function forgetBooks() { memoryCache.clear(); }

const PREF_KEY = "bookkit-ui";
function readPrefs(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); } catch { return {}; }
}
export function writePrefs(update: Record<string, any>) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPrefs(), ...update })); } catch { /* storage unavailable */ }
}
export const prefs = readPrefs;

function trackDailyWords(projectId: string | null, total: number): number {
  if (!projectId) return 0;
  const today = new Date().toLocaleDateString("sv");
  const daily = prefs().daily ?? {};
  let entry = daily[projectId];
  if (!entry || entry.date !== today) {
    entry = { date: today, baseline: total };
    writePrefs({ daily: { ...daily, [projectId]: entry } });
  }
  return Math.max(0, total - entry.baseline);
}

export const useBookStore = create<BookState>((set, get) => {
  const rebuild = (immediate = false) => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    const run = () => {
      const { projectId, files } = get();
      if (projectId && files.length) remember(projectId, files);
      const model = buildBookModel(files);
      set({ model, wordsToday: trackDailyWords(get().projectId, model.chapters.reduce((n, c) => n + c.authorWords, 0)) });
    };
    if (immediate) run(); else rebuildTimer = setTimeout(run, 400);
  };
  return {
    projectId: null,
    files: [],
    model: null,
    status: "idle",
    error: "",
    live: "CONNECTING",
    view: "write",
    location: { path: "", nonce: 0 },
    openThreads: {},
    pendingSuggestions: {},
    reviewVersion: {},
    selectedEntity: null,
    panel: prefs().panel ?? "context",
    panelOpen: typeof window !== "undefined" && window.innerWidth <= 1080 ? false : prefs().panelOpen ?? true,
    focusMode: false,
    visibleChapter: undefined,
    wordsToday: 0,
    activeThread: undefined,
    setActiveThread: (id) => { if (get().activeThread !== id) set({ activeThread: id }); },
    reviews: {},
    setVisibleChapter: (n) => { if (get().visibleChapter !== n) set({ visibleChapter: n }); },
    loadReview: async (path) => {
      const projectId = get().projectId;
      if (!projectId || !path) return;
      const review = await readBookReview(projectId, path);
      if (get().projectId === projectId) set(s => ({ reviews: { ...s.reviews, [path]: review } }));
    },

    load: async (projectId) => {
      if (get().projectId === projectId && get().status !== "error") return;
      get().unload();
      const saved = prefs().locations?.[projectId];
      lastWritePath = saved?.view === "write" && isManuscriptPlace(saved.path ?? "") ? saved.path ?? "" : "";
      set({ projectId, files: [], model: null, status: "loading", error: "", location: { path: saved?.path ?? "", anchor: saved?.anchor, nonce: ++nonce }, view: saved?.view ?? "write", selectedEntity: null });
      // Show what this browser last saw right away, then bring it up to date.
      const cached = memoryCache.get(projectId) ?? await readStored<BookDocumentRow[]>(cacheKey(projectId));
      if (get().projectId !== projectId) return;
      try {
        if (cached?.length) {
          set({ files: cached, status: "ready" });
          rebuild(true);
          void get().refreshReviewCounts();
          void get().revalidate();
        } else {
          const files = await listBookDocuments(projectId);
          if (get().projectId !== projectId) return;
          set({ files, status: "ready" });
          rebuild(true);
          remember(projectId, files, 0);
          void get().refreshReviewCounts();
        }
      } catch (e) {
        set({ status: "error", error: (e as Error).message });
        return;
      }
      stopActivity = subscribeBookActivity(projectId, event => {
        if (get().projectId !== projectId) return;
        if (event.kind === "bookkit_documents" || event.kind === "bookkit_assets") void get().refreshPath(event.path);
        else {
          set(s => ({ reviewVersion: { ...s.reviewVersion, [event.path]: (s.reviewVersion[event.path] ?? 0) + 1 } }));
          if (get().reviews[event.path]) void get().loadReview(event.path);
          void get().refreshReviewCounts();
        }
      }, status => {
        set({ live: status });
        if (status === "SUBSCRIBED") void get().refreshReviewCounts();
      });
      pollTimer = setInterval(() => void get().refreshReviewCounts(), 60000);
    },

    revalidate: async () => {
      const { projectId, files: before } = get();
      if (!projectId) return;
      try {
        const { rows, changed } = await refreshBookDocuments(projectId, before);
        if (get().projectId !== projectId) return;
        if (changed) {
          // Keep anything saved in this tab while the refresh was running.
          const mine = new Map(get().files.map(f => [f.path, f]));
          const files = rows.map(r => { const m = mine.get(r.path); return m && m.loaded && !m.asset && m.version > r.version ? m : r; });
          set({ files });
          rebuild(true);
        }
        remember(projectId, get().files, 0);
      } catch { /* offline: keep what we have */ }
    },

    unload: () => {
      const { projectId, files } = get();
      if (projectId && files.length) memoryCache.set(projectId, files);
      stopActivity?.();
      stopActivity = null;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      set({ projectId: null, files: [], model: null, status: "idle", openThreads: {}, pendingSuggestions: {}, reviewVersion: {}, reviews: {} });
    },

    refreshPath: async (path) => {
      const projectId = get().projectId;
      if (!projectId) return null;
      try {
        const row = await readBookDocument(projectId, path);
        if (get().projectId !== projectId) return null;
        get().upsert(row);
        return row;
      } catch {
        // deleted
        set(s => ({ files: s.files.filter(f => f.path !== path) }));
        rebuild();
        return null;
      }
    },

    upsert: (row) => {
      set(s => {
        const index = s.files.findIndex(f => f.path === row.path);
        if (index >= 0 && s.files[index].version > row.version && s.files[index].loaded) return s;
        const files = index >= 0 ? s.files.map((f, i) => (i === index ? { ...row, loaded: true } : f)) : [...s.files, { ...row, loaded: true }].sort((a, b) => a.path.localeCompare(b.path));
        return { files };
      });
      rebuild();
    },

    drop: (path) => {
      set(s => ({ files: s.files.filter(f => f.path !== path) }));
      rebuild();
    },

    ensureLoaded: async (path) => {
      const existing = get().files.find(f => f.path === path);
      if (existing?.loaded) return existing;
      return get().refreshPath(path);
    },

    refreshReviewCounts: async () => {
      const projectId = get().projectId;
      if (!projectId) return;
      const [threads, suggestions] = await Promise.all([
        supabase.from("bookkit_threads").select("path").eq("project_id", projectId).is("resolved_at", null),
        supabase.from("bookkit_suggestions").select("path").eq("project_id", projectId).eq("status", "pending"),
      ]);
      if (get().projectId !== projectId) return;
      const count = (rows: Array<{ path: string }> | null) => (rows ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.path]: (acc[r.path] ?? 0) + 1 }), {});
      set({ openThreads: count(threads.data), pendingSuggestions: count(suggestions.data) });
    },

    setView: (view) => {
      // Each view opens on its overview; the manuscript returns to where you were.
      get().go(view === "write" ? lastWritePath : "", { view });
    },

    go: (path, opts = {}) => {
      const view = opts.view ?? (path ? viewForPath(path) : "write");
      if (navFlags.openInNewTab) {
        navFlags.openInNewTab = false;
        const { projectId, model } = get();
        const catalog = useProjectStore.getState().projectCatalog;
        if (projectId && model) {
          openInNewTab(routeToUrl(bookSlug(catalog, projectId), { view, path, anchor: opts.anchor }, model));
        }
        return;
      }
      if (view === "write" && isManuscriptPlace(path)) lastWritePath = path;
      set({ location: { path, anchor: opts.anchor, find: opts.find, nonce: ++nonce }, view });
      const { projectId } = get();
      if (projectId) writePrefs({ locations: { ...(prefs().locations ?? {}), [projectId]: { path, view, anchor: opts.anchor } } });
      if (path.startsWith("research/")) void get().ensureLoaded(path);
    },

    applyRoute: (route) => get().go(route.path, { view: route.view, anchor: route.anchor }),

    selectEntity: (id) => {
      if (id && navFlags.openInNewTab) {
        navFlags.openInNewTab = false;
        const { projectId, model } = get();
        const catalog = useProjectStore.getState().projectCatalog;
        const entity = model?.entities.find(e => e.id === id);
        if (projectId && model && entity) {
          openInNewTab(routeToUrl(bookSlug(catalog, projectId), { view: "bible", path: entity.path, anchor: entity.slug }, model));
        }
        return;
      }
      set(s => ({ selectedEntity: id, panel: id ? "context" : s.panel, panelOpen: id ? true : s.panelOpen }));
    },
    setPanel: (panel, open = true) => { set({ panel, panelOpen: open }); writePrefs({ panel, panelOpen: open }); },
    togglePanel: () => { const open = !get().panelOpen; set({ panelOpen: open }); writePrefs({ panelOpen: open }); },
    setFocusMode: (on) => set({ focusMode: on }),
  };
});
