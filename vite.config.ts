import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Rare Advance runs in SIMULATED mode. Nothing here can sign or send a
 * transaction: there is no wallet-transport plugin, no contract-write helper
 * and no key material of any kind in the bundle.
 *
 * The dev/preview server additionally exposes two read-only proxy routes so
 * the browser can reach first-party Rare Friends JSON endpoints that do not
 * send CORS headers. They are GET/POST-JSON-RPC pass-throughs only.
 */
const RF_API_BASE = process.env.VITE_RF_API_BASE ?? 'https://rarefriends.com'

const readOnlyProxy = (target: string) => ({
  // `rewrite` returns the upstream path; the query string is preserved, which
  // matters because the owned-NFTs endpoint is addressed by ?address=.
  '/api/rf-owned-nfts': {
    target,
    changeOrigin: true,
    rewrite: (p: string) => p.replace('/api/rf-owned-nfts', '/api/protocol/owned-nfts'),
  },
  '/api/rf-snapshot': {
    target,
    changeOrigin: true,
    rewrite: (p: string) => p.replace('/api/rf-snapshot', '/api/protocol/snapshot'),
  },
})

export default defineConfig({
  // Relative base so a project-scoped GitHub Pages URL works unchanged.
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: readOnlyProxy(RF_API_BASE),
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: readOnlyProxy(RF_API_BASE),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          viem: ['viem'],
        },
      },
    },
  },
})
