import { create } from "zustand";
import {
  signIn as sbSignIn,
  acceptProjectInvitations,
  signOut as sbSignOut,
  getCurrentUser,
  restoreSession,
  verifySignInCode,
} from "../lib/supabase-service";

interface AuthStore {
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;

  signIn: (email: string, password: string, alreadySignedIn?: boolean) => Promise<void>;
  signInWithCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  userId: null,
  userEmail: null,
  isAuthenticated: false,

  signInWithCode: async (email, code) => {
    await verifySignInCode(email, code);
    await get().signIn("", "", true);
  },

  signIn: async (email, password, alreadySignedIn?: boolean) => {
    if (!alreadySignedIn) await sbSignIn(email, password);
    const user = await getCurrentUser();
    if (user) {
      try { localStorage.removeItem("bookkit-auth-note"); } catch { /* storage unavailable */ }
      await acceptProjectInvitations();
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
      projectCatalog: [],
      currentProjectId: null,
      realtimeUnsubscribe: null,
    });
  },

  checkAuth: async () => {
    const user = await restoreSession().catch(() => null);
    if (user) {
      await acceptProjectInvitations().catch(() => undefined);
      set({ userId: user.id, userEmail: user.email, isAuthenticated: true });
      return true;
    }
    return false;
  },
}));
