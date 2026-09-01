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
// The website version is the same application built with `--mode web`: it
// targets modern engines (SharedArrayBuffer-era browsers, which threaded
// Writer requires anyway) and lands in dist-web/ so the two outputs never
// clobber each other.
export default defineConfig(async ({ mode }) => ({
  plugins: [svelte()],
  base: "./",
  resolve: {
    alias: {
      "@": "/src",
    },
  },

  // Threaded LOWA requires SharedArrayBuffer, so development responses must
  // carry the same cross-origin isolation headers as packaged Tauri assets.
  // Deployed websites must serve them too (or rely on the bundled service
  // worker's header injection) — see docs/web-hosting.md.
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
  build: mode === "web"
    ? {
        target: "es2022",
        minify: "esbuild" as const,
        sourcemap: false,
        outDir: "dist-web",
      }
    : {
        target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
        minify: !process.env.TAURI_ENV_DEBUG ? ("esbuild" as const) : false,
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
        outDir: "dist",
      },
}));
