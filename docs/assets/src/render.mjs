/* global process, document */
// Regenerates docs/assets/social-preview.png and docs/assets/src/icon-master.png (1024px master for `tauri icon`).
// Usage: node docs/assets/src/render.mjs   (uses Playwright + Edge/Chromium already in devDependencies)
import { chromium } from '@playwright/test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })
async function shot(file, w, h, out, transparent) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(pathToFileURL(path.join(here, file)).href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(here, out), omitBackground: transparent })
  await page.close()
}
await shot('icon-master.svg', 1024, 1024, 'icon-master.png', true)
await shot('social-preview.html', 1280, 640, '../social-preview.png', false)
await browser.close()
