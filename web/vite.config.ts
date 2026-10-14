import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const apiPort = process.env.API_PORT || "4200";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "icons/favicon-64.png", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Sahaya AI",
        short_name: "Sahaya",
        description: "Your AI helper for every emergency: a real AI calling agent that speaks 11 Indian languages, for disaster SOS, health follow-up calls, farmer advice and scam protection.",
        lang: "en",
        theme_color: "#ffffff",
        background_color: "#f6f7fb",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["utilities", "health", "productivity"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // The API (and its SSE stream) must never be served by the service worker.
        navigateFallbackDenylist: [/^\/api/, /^\/download\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
  preview: {
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
