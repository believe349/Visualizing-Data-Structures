import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `vite` serves the UI on :5173 and proxies the dynamic /run API to the
// Python backend (`py server.py`) on :8000. frames.json lives in public/ so
// Vite serves it directly (and copies it into dist/ on build).
// Prod: `vite build` -> dist/, served by server.py.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/run": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
