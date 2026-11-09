import { create } from "zustand";
import { navFlags, openInNewTab } from "../lib/book-url";

/** Whether the workspace home (all books) is showing instead of a book. */
export const useHomeStore = create<{ home: boolean; setHome: (home: boolean) => void; showHome: () => void }>((set) => ({
  home: typeof window !== "undefined" && window.location.pathname === "/",
  setHome: (home) => set({ home }),
  showHome: () => {
    if (navFlags.openInNewTab) {
      navFlags.openInNewTab = false;
      openInNewTab("/");
      return;
    }
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
    set({ home: true });
  },
}));
