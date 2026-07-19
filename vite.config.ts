import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Local-first: workshop wifi is unreliable and every feature must work in
// airplane mode (plan.md §4). The service worker precaches the build so the
// app loads offline after the first visit; autoUpdate swaps in a new build on
// the next load.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Forge Log",
        short_name: "Forge Log",
        description: "Maker OS for laser & vinyl workshops: settings, costing, catalog. Offline.",
        lang: "en",
        dir: "ltr",
        start_url: "/",
        id: "/",
        display: "standalone",
        background_color: "#0e0f13",
        theme_color: "#e0692a",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  // `vite preview` serves the built dist — the only mode where the service
  // worker is active (PWA is disabled in dev). Honour PORT so it can be placed.
  preview: {
    port: Number(process.env.PORT) || 4173,
    strictPort: false,
  },
});
