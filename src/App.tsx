import { useEffect, useCallback, useRef, useState } from "react";
import { useProjectStore } from "./store/useProjectStore";
import { useAuthStore } from "./store/useAuthStore";
import { Layout } from "./components/Layout";
import { LoginScreen } from "./components/LoginScreen";

export default function App() {
  const {
    loadFromStorage,
    saveToStorage,
    dirty,
  } = useProjectStore();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const didBootstrap = useRef(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;
    // Check if user is already authenticated (session persisted)
    checkAuth().then((authed) => {
      if (authed) void loadFromStorage();
    }).finally(() => setChecking(false));
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
      <Layout />
    </div>
  );
}
