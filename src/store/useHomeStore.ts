import { create } from "zustand";

/** Whether the workspace home (all books) is showing instead of a book. */
export const useHomeStore = create<{ home: boolean; setHome: (home: boolean) => void; showHome: () => void }>((set) => ({
  home: typeof window !== "undefined" && window.location.pathname === "/",
  setHome: (home) => set({ home }),
  showHome: () => {
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
    set({ home: true });
  },
}));
