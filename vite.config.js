/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A local dev URL can otherwise be silently baked into a production bundle.
// Deployment environments must provide their own reachable HTTPS API base.
const assertProductionEnv = (mode) => {
  if (mode !== 'production') return
  const api = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL
  let url
  try { url = new URL(api) } catch { /* Report the configuration error below. */ }
  const host = url?.hostname.toLowerCase().replace(/\.$/, '')
  if (!url || url.protocol !== 'https:' || /^(localhost|127\..*|0\.0\.0\.0|\[::1\])$/.test(host) || host.endsWith('.localhost')) {
    throw new Error('Production builds require VITE_API_BASE_URL to be a non-local HTTPS URL. Set it in the deployment environment or .env.production.')
  }
}

// Standalone provider app. Runs on :5175 in dev so it collides with neither the
// public app (:5173) nor the admin console (:5174). The backend allow-lists
// this origin via PROVIDER_CORS_ORIGINS.
export default defineConfig(({ mode }) => {
  assertProductionEnv(mode)
  return {
  // ─── Tests ────────────────────────────────────────────────────────────────
  // `jsdom` rather than the default node environment: almost everything worth
  // testing here touches localStorage, geolocation or the DOM.
  //
  // `include` is narrow on purpose. The default glob picks up anything under
  // node_modules that happens to match, which turns a two-second run into a
  // minute of somebody else's tests.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },

  plugins: [react()],
  base: '/',
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    port: 5175,
    strictPort: true,
  },
  }
})
