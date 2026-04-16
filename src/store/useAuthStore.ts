import { create } from "zustand";
import {
  signIn as sbSignIn,
  signOut as sbSignOut,
  getCurrentUser,
} from "../lib/supabase-service";

interface AuthStore {
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  userId: null,
  userEmail: null,
  isAuthenticated: false,

  signIn: async (email, password) => {
    await sbSignIn(email, password);
    const user = await getCurrentUser();
    if (user) {
      set({ userId: user.id, userEmail: user.email, isAuthenticated: true });
      // Dynamic import to break circular dependency (useProjectStore imports useAuthStore)
      const { useProjectStore } = await import("./useProjectStore");
      await useProjectStore.getState().loadFromStorage();
    }
  },

  signOut: async () => {
    // Dynamic import to break circular dependency
    const { useProjectStore } = await import("./useProjectStore");
    const unsub = useProjectStore.getState().realtimeUnsubscribe;
    if (unsub) unsub();

    await sbSignOut();
    set({
      userId: null,
      userEmail: null,
      isAuthenticated: false,
    });

    // Reset project state
    useProjectStore.setState({
      projects: [],
      currentProjectId: null,
      realtimeUnsubscribe: null,
    });
  },

  checkAuth: async () => {
    const user = await getCurrentUser();
    if (user) {
      set({ userId: user.id, userEmail: user.email, isAuthenticated: true });
      return true;
    }
    return false;
  },
}));
