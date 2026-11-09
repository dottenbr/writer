import { useEffect, useCallback, useRef, useState, lazy, Suspense } from "react";
import { useProjectStore } from "./store/useProjectStore";
import { useAuthStore } from "./store/useAuthStore";
import { LoginScreen } from "./components/LoginScreen";
import { supabase } from "./lib/supabase-client";
import { noteSignOutReason, signingOut } from "./lib/supabase-service";

const Layout = lazy(() => import("./components/Layout").then((m) => ({ default: m.Layout })));

export default function App() {
  const {
    loadFromStorage,
    saveToStorage,
    dirty,
  } = useProjectStore();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const didBootstrap = useRef(false);
  const didBootstrapLogin = useRef(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;
    // Check if user is already authenticated (session persisted)
    const start = async () => {
      // The link in a sign-in email: /sign-in?email=…&code=…
      const params = new URLSearchParams(window.location.search);
      const email = params.get("email"), code = params.get("code");
      if (window.location.pathname === "/sign-in") {
        window.history.replaceState(null, "", "/");
        if (email && code) {
          try { await useAuthStore.getState().signInWithCode(email, code); return; }
          catch (e) { try { sessionStorage.setItem("bookkit-link-failed", JSON.stringify({ email, error: (e as Error).message })); } catch { /* storage unavailable */ } }
        }
      }
      if (await checkAuth()) void loadFromStorage();
    };
    void start().finally(() => setChecking(false));
  }, []);

  // Follow Supabase's own view of the session: a session confirmed late gets
  // you in; a session ended by the server signs you out.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const auth = useAuthStore.getState();
      if ((event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") && session && !auth.isAuthenticated && !didBootstrapLogin.current) {
        didBootstrapLogin.current = true;
        useAuthStore.setState({ userId: session.user.id, userEmail: session.user.email ?? null, isAuthenticated: true });
        void loadFromStorage();
      }
      if (event === "SIGNED_OUT" && auth.isAuthenticated && !signingOut.current) {
        noteSignOutReason("The session ended (signed out in Supabase).");
        useAuthStore.setState({ userId: null, userEmail: null, isAuthenticated: false });
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save every 30 seconds if dirty
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (dirty) void saveToStorage();
    }, 30000);
    return () => clearInterval(interval);
  }, [dirty, isAuthenticated]);

  // Ctrl/Cmd+S to save
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if(window.dispatchEvent(new Event("writer-save-document", {cancelable:true}))) void saveToStorage();
      }
    },
    [saveToStorage]
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const handlePageHide = () => {
      if (dirty) void saveToStorage();
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [dirty, saveToStorage]);

  if (!isAuthenticated && checking) {
    return <div className="boot-screen" aria-busy="true"><span className="brand-mark">b</span></div>;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app-root">
      <Suspense fallback={<div className="boot-screen" aria-busy="true"><span className="brand-mark">b</span></div>}>
        <Layout />
      </Suspense>
    </div>
  );
}
