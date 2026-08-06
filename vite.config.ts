import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

// Tauri expects a fixed dev-server port and a relative asset base so the
// production build loads correctly from the packaged app's local protocol.
export default defineConfig(async () => ({
  plugins: [svelte()],
  base: "./",
  resolve: {
    alias: {
      "@": "/src",
    },
  },

  // Threaded LOWA requires SharedArrayBuffer, so development responses must
  // carry the same cross-origin isolation headers as packaged Tauri assets.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    headers: isolationHeaders,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: {
    headers: isolationHeaders,
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
  },
}));
