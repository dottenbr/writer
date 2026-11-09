import { create } from "zustand";
import { loadLibraries, type Library } from "../lib/supabase-service";
import { hostLibrary } from "../lib/library-host";

interface LibraryState {
  libraries: Library[] | null;
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

export const useLibraryStore = create<LibraryState>((set, get) => ({
  libraries: null,
  selectedSlug: initialSelectedSlug(),
  error: "",
  load: async () => {
    try { set({ libraries: await loadLibraries(), error: "" }); }
    catch (e) { set({ error: (e as Error).message, libraries: get().libraries ?? [] }); }
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
