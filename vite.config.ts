import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror") || id.includes("linkifyjs")) return "editor";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("marked") || id.includes("/yaml/") || id.includes("/diff/")) return "markdown";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("zustand") || id.includes("scheduler")) return "vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 1420,
    proxy: {"/api": "http://127.0.0.1:8787"},
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
