import { create } from "zustand";
import { loadLibraries, type Library } from "../lib/supabase-service";
import { hostLibrary } from "../lib/library-host";

interface LibraryState {
  libraries: Library[] | null;
  error: string;
  load: () => Promise<void>;
  /** The library this address belongs to (null on bookkit.net; undefined while loading or not found). */
  current: () => Library | null | undefined;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  libraries: null,
  error: "",
  load: async () => {
    try { set({ libraries: await loadLibraries(), error: "" }); }
    catch (e) { set({ error: (e as Error).message, libraries: get().libraries ?? [] }); }
  },
  current: () => {
    const slug = hostLibrary();
    if (!slug) return null;
    return get().libraries?.find(l => l.slug === slug);
  },
}));

/** Whether the role lets you write in the library (add books, shelves). */
export const canWriteIn = (lib: Library | null | undefined) => !!lib && (lib.role === "owner" || lib.role === "coauthor");
