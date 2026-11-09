import { create } from "zustand";
import { loadLibraries, type Library } from "../lib/supabase-service";
import { hostLibrary } from "../lib/library-host";
import { readLocal, writeLocal } from "../lib/local-cache";
import { useAuthStore } from "./useAuthStore";

interface LibraryState {
  libraries: Library[] | null;
  /** Whether `libraries` came from the server in this session (not only from this browser's cache). */
  fresh: boolean;
  selectedSlug: string | null;
  error: string;
  load: () => Promise<void>;
  selectLibrary: (slug: string | null) => void;
  /** The library this address belongs to (null on bookkit.net unless a library is selected; undefined while loading or not found). */
  current: () => Library | null | undefined;
}

function initialSelectedSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("library");
    return q ? q.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

let inflight: Promise<void> | null = null;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  libraries: null,
  fresh: false,
  selectedSlug: initialSelectedSlug(),
  error: "",
  load: () => {
    if (inflight) return inflight;
    const key = `libraries:${useAuthStore.getState().userId ?? "anon"}`;
    // Show the libraries this browser last saw while asking for the current list.
    if (!get().libraries) { const cached = readLocal<Library[]>(key); if (cached) set({ libraries: cached }); }
    inflight = (async () => {
      try {
        const libraries = await loadLibraries();
        set({ libraries, fresh: true, error: "" });
        writeLocal(key, libraries);
      } catch (e) { set({ error: (e as Error).message, libraries: get().libraries ?? [], fresh: true }); }
      finally { inflight = null; }
    })();
    return inflight;
  },
  selectLibrary: (slug) => {
    set({ selectedSlug: slug });
    if (typeof window !== "undefined" && !hostLibrary()) {
      const url = slug ? `/?library=${encodeURIComponent(slug)}` : "/";
      if (window.location.pathname + window.location.search !== url) {
        window.history.pushState(null, "", url);
      }
    }
  },
  current: () => {
    const slug = hostLibrary() ?? get().selectedSlug;
    if (!slug) return null;
    return get().libraries?.find(l => l.slug === slug);
  },
}));

/** Whether the role lets you write in the library (add books, shelves). */
export const canWriteIn = (lib: Library | null | undefined) => !!lib && (lib.role === "owner" || lib.role === "coauthor");
