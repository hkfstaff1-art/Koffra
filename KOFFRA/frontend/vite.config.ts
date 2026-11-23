/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// En développement, l'API Laravel (php artisan serve, port 8000) est servie via le proxy Vite :
// frontend et API partagent la même origine, comme en production sur Hostinger,
// ce qui permet des cookies de session SameSite=Strict.
const apiTarget = process.env.KOFFRA_API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      // Service worker limité au shell applicatif (docs/02) : JS/CSS/icônes uniquement.
      // Aucune réponse de l'API n'est jamais mise en cache, et les pages sont toujours
      // demandées au serveur (pas de navigateFallback).
      workbox: {
        globPatterns: ['assets/**/*.{js,css}', '*.png', 'brand/*.png'],
        navigateFallback: null,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'KOFFRA — Coffre-fort numérique',
        short_name: 'KOFFRA',
        description: 'Coffre-fort numérique privé, chiffré de bout en bout.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f3f6fa',
        theme_color: '#0b2545',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/sanctum': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    // libsodium (WebAssembly embarqué) représente l'essentiel du poids : chargé une seule fois puis mis en cache.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('libsodium') ? 'libsodium' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
