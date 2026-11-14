import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    host: true, port: 5173, allowedHosts: true,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2020" },
});
