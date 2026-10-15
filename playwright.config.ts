import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const PORT = 1430
// Locally Windows uses the installed, signed Microsoft Edge (no browser download, and Smart App
// Control does not block it). CI (Linux) uses Playwright's own Chromium. `PW_CHANNEL` overrides.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)

const use = {
  ...devices['Desktop Chrome'],
  channel,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  locale: 'pt-BR',
  timezoneId: 'UTC',
  reducedMotion: 'reduce' as const,
}

/**
 * Two projects over the same app:
 *  - `flows`: behaviour. Runs everywhere, including CI (`pnpm e2e:flows`).
 *  - `visual`: screenshots against the baselines in `e2e/visual.spec.ts-snapshots`. Playwright
 *    keeps baselines per platform and fonts render differently on each, so these are generated and
 *    run on the developer's machine only (`pnpm e2e:visual`, `pnpm e2e:update`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results',
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100 },
  },
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'flows', testMatch: 'flows.spec.ts', use },
    { name: 'visual', testMatch: 'visual.spec.ts', use },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --mode e2e --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
