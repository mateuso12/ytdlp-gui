import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
const host = process.env.TAURI_DEV_HOST

/**
 * In `--mode e2e` the page starts from `main.e2e.tsx` (the real UI over the mock bridge, with a
 * test hook) instead of `main.tsx`. Other modes leave index.html untouched, so the hook can never
 * end up in the app.
 */
function e2eEntry(): Plugin {
  return {
    name: 'e2e-entry',
    apply: (_config, env) => env.mode === 'e2e',
    transformIndexHtml: (html) => html.replace('/src/main.tsx', '/src/main.e2e.tsx'),
  }
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), e2eEntry()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}))
