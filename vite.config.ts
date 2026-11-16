import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist-ui",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve("web/index.html"),
        analytics: resolve("web/analytics.ts"),
      },
      output: { entryFileNames: (chunk) => chunk.name === "analytics" ? "analytics.js" : "assets/[name]-[hash].js" },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
