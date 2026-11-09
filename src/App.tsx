import { useEffect, useCallback, useRef, useState, lazy, Suspense } from "react";
import { useProjectStore } from "./store/useProjectStore";
import { useAuthStore } from "./store/useAuthStore";
import { LoginScreen } from "./components/LoginScreen";
import { supabase } from "./lib/supabase-client";
import { noteSignOutReason, signingOut } from "./lib/supabase-service";
import { navFlags } from "./lib/book-url";
import { hostLibrary } from "./lib/library-host";
import { leaveSignInAddress, usePublicLocation } from "./lib/public-routes";

const NAV_BUTTON_SELECTOR = [
  ".ws-book",
  ".ws-hero .link-btn.inline:not([data-no-tab])",
  "button.brand-home",
  ".lib-crumb",
  ".book-menu button.menu-item:not([data-no-tab])",
  ".menubar-btn",
  ".menubar-menu button.menu-item:not([data-no-tab])",
  ".nav-item:not(.nav-add)",
  ".nav-outline-item",
  ".palette-item",
  ".plan-card",
  ".plan-row-title",
  ".board-links .btn",
  ".entity-tile:not(.empty-tile)",
  ".ref-doc",
  ".bible-section-link",
  ".entity-crumbs .link-btn",
  ".entity-pager .icon-btn:not(:disabled)",
  ".entity-appears .chip",
  ".entity-foot .link-btn:not(.danger)",
  ".board-head .link-btn",
  ".board-head .board-actions .btn:not([data-no-tab])",
  ".panel-stack:not(.comments) .link-btn",
  ".panel-stack:not(.comments) .chip",
  ".panel-stack:not(.comments) .ref-item",
  ".panel-stack:not(.comments) .mention",
  ".title-page-cta",
  ".title-page-mood-caption",
].join(", ");

const Layout = lazy(() => import("./components/Layout").then((m) => ({ default: m.Layout })));
const MarketingSite = lazy(() => import("./components/marketing/MarketingSite").then((m) => ({ default: m.MarketingSite })));
const DocsSite = lazy(() => import("./components/docs/DocsSite").then((m) => ({ default: m.DocsSite })));
const SignUpFlow = lazy(() => import("./components/marketing/SignUpFlow").then((m) => ({ default: m.SignUpFlow })));

export default function App() {
  const {
    loadFromStorage,
    saveToStorage,
    dirty,
  } = useProjectStore();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const publicPage = usePublicLocation(isAuthenticated, !!hostLibrary());
  useEffect(() => { if (isAuthenticated) leaveSignInAddress(); }, [isAuthenticated]);
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

  // Middle-click (button 1) and Cmd/Ctrl-click open navigation buttons and links in a new tab.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(`a[href], [data-entity], [data-chapters], ${NAV_BUTTON_SELECTOR}`)) {
        e.preventDefault();
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (e.button !== 0 || !(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(NAV_BUTTON_SELECTOR) as HTMLButtonElement | null;
      if (btn && !btn.disabled) {
        navFlags.openInNewTab = true;
        setTimeout(() => { navFlags.openInNewTab = false; }, 0);
      }
    };
    const onAuxClick = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(NAV_BUTTON_SELECTOR) as HTMLButtonElement | null;
      if (btn && !btn.disabled) {
        e.preventDefault();
        navFlags.openInNewTab = true;
        try {
          btn.click();
        } finally {
          navFlags.openInNewTab = false;
        }
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("auxclick", onAuxClick);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("auxclick", onAuxClick);
    };
  }, []);

  const bootScreen = <div className="boot-screen" aria-busy="true"><span className="brand-mark">b</span></div>;

  if (publicPage.kind === "docs") {
    return (
      <Suspense fallback={bootScreen}>
        <DocsSite slug={publicPage.slug} />
      </Suspense>
    );
  }

  if (!isAuthenticated && checking) {
    return bootScreen;
  }

  if (publicPage.kind === "signup") {
    return (
      <Suspense fallback={bootScreen}>
        <SignUpFlow initialSlug={publicPage.initialSlug} />
      </Suspense>
    );
  }

  if (publicPage.kind === "marketing") {
    return (
      <Suspense fallback={bootScreen}>
        <MarketingSite initialSection={publicPage.section} />
      </Suspense>
    );
  }

  if (publicPage.kind === "login" || !isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app-root">
      <Suspense fallback={bootScreen}>
        <Layout />
      </Suspense>
    </div>
  );
}
