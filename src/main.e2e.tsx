// The entry point of the Playwright build (`vite --mode e2e`). It wires the real app exactly like
// `main.tsx`, but over the mock bridge, so the whole UI runs in a plain browser with no Tauri.
// It also exposes `window.__e2e` so specs can play the part of yt-dlp. None of this ships:
// the production build starts from `main.tsx` and never imports this file.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { APP_NAME } from './app/brand'
import { applyTheme } from './app/theme'
import { BridgeProvider } from './bridge/context'
import { createMockBridge } from './bridge/mock'
import type { ProbeResult } from './bridge/types'
import playlistFlat from './core/__fixtures__/playlist-flat.json?raw'
import unsupportedStderr from './core/__fixtures__/stderr-unsupported.txt?raw'
import video from './core/__fixtures__/video.json?raw'
import type { E2EHook } from './e2e-hook'
import './i18n'
import { ProbeProvider } from './screens/Download/ProbeProvider'
import { UrlField } from './screens/Download/UrlField'
import { bootstrapStores } from './stores/bootstrap'
import './styles/global.css'
import { ALL_INSTALLED } from './test/fixtures'

const ok = (stdout: string): ProbeResult => ({ code: 0, stdout, stderr: '' })

/** Answers like yt-dlp would for the fixture links (real captures from `src/core/__fixtures__`). */
function router(args: string[]): ProbeResult {
  const url = args[args.length - 1]
  if (url === 'https://example.com/') return { code: 1, stdout: '', stderr: unsupportedStderr }
  if (args.includes('--flat-playlist') && url.includes('list=')) return ok(playlistFlat)
  return ok(video)
}

const bridge = createMockBridge({
  deps: ALL_INSTALLED,
  fallbackProbe: router,
  videoDir: String.raw`C:\Users\e2e\Videos`,
})

declare global {
  interface Window {
    __e2e: E2EHook
  }
}
window.__e2e = { emitLine: bridge.emitLine, emitExit: bridge.emitExit, calls: bridge.calls }

document.title = APP_NAME
applyTheme('system', window.matchMedia('(prefers-color-scheme: dark)').matches)

bootstrapStores(bridge).catch((error: unknown) => console.error('store bootstrap failed', error))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BridgeProvider bridge={bridge}>
      <ProbeProvider>
        <App urlSlot={<UrlField />} />
      </ProbeProvider>
    </BridgeProvider>
  </React.StrictMode>,
)
