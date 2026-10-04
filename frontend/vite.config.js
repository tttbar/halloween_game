import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + WebSocket to the FastAPI backend on :8000 so the
// kiosk can be served from a single origin during development.
const backendPort = process.env.BACKEND_PORT || 8000;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${backendPort}`, changeOrigin: true },
      "/ws": { target: `ws://localhost:${backendPort}`, ws: true },
    },
  },
});
