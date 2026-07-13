import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// dev: מפרוקסי את ה-API וה-ws לשרת המקומי; prod: השרת מגיש את dist
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
