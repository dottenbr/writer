import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/studio.css";

try {
  const saved = JSON.parse(localStorage.getItem("bookkit-ui") ?? "{}").theme;
  document.documentElement.dataset.theme = saved ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  document.documentElement.dataset.theme = "light";
}

// After a release, a tab opened before it may ask for code files that no longer
// exist. Reload once to pick up the new release instead of showing an error.
window.addEventListener("vite:preloadError", event => {
  try {
    const last = Number(sessionStorage.getItem("bookkit-chunk-reload") ?? 0);
    if (Date.now() - last < 30000) return;
    sessionStorage.setItem("bookkit-chunk-reload", String(Date.now()));
  } catch { /* storage unavailable: reload anyway */ }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
