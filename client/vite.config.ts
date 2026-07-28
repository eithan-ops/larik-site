import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

/** אפליקציית המופע חיה תחת /s (וב-prod גם בדומיין show.*) — ב-dev/preview משכתבים ל-show.html */
function showAppRewrite(): Plugin {
  const rewrite = (url?: string) =>
    url === "/s" || url?.startsWith("/s/") || url?.startsWith("/s?") ? "/show.html" : null;
  return {
    name: "show-app-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const to = rewrite(req.url);
        if (to) req.url = to;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const to = rewrite(req.url);
        if (to) req.url = to;
        next();
      });
    },
  };
}

// dev: מפרוקסי את ה-API וה-ws לשרת המקומי; prod: השרת מגיש את dist
export default defineConfig({
  plugins: [react(), showAppRewrite()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        show: resolve(__dirname, "show.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
