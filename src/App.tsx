import { useEffect, useCallback, useRef } from "react";
import { useProjectStore } from "./store/useProjectStore";
import { Layout } from "./components/Layout";
import { LoginScreen } from "./components/LoginScreen";

export default function App() {
  const {
    loadFromStorage,
    saveToStorage,
    dirty,
    darkMode,
    isAuthenticated,
    checkAuth,
  } = useProjectStore();
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;
    // Check if user is already authenticated (session persisted)
    checkAuth().then((authed) => {
      if (authed) void loadFromStorage();
    });
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
        void saveToStorage();
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

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className={`app-root ${darkMode ? "dark" : ""}`}>
      <Layout />
    </div>
  );
}
