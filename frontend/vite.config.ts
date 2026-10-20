import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is proxied to the FastAPI adapter (backend/main.py) on port 8000.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
