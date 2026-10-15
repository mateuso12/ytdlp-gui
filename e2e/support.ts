import { expect, test as base, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { E2EHook } from '../src/e2e-hook'

export const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
export const LIST_ID = 'PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv'
export const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${LIST_ID}`
export const AMBIGUOUS_URL = `${VIDEO_URL}&list=${LIST_ID}`
export const VIDEO_TITLE = 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film'

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../src/core/__fixtures__/${name}`, import.meta.url)), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'))

/** Real yt-dlp output, captured into the core fixtures. */
export const PROGRESS_LINES = fixture('progress-video.txt')
/** A real yt-dlp error (age-gated video). */
export const AGE_ERROR_LINES = fixture('stderr-age.txt')

/** Index of the last "finished" progress line (100%), before merging starts. */
export const LAST_PROGRESS = PROGRESS_LINES.findLastIndex((l) => l.includes('"status": "finished"'))

// A flat placeholder instead of YouTube's thumbnails: no network, identical pixels on every run.
const THUMB = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7c99"/><stop offset="1" stop-color="#2f4858"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/></svg>`

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https:\/\/(i\d?\.ytimg\.com|yt3\.ggpht\.com)\//, (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: THUMB }),
    )
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await use(page)
  },
})

export { expect }

type Hooked = Window & { __e2e: E2EHook }

export const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name })

export const urlField = (page: Page) =>
  page.getByRole('textbox', { name: 'Link do vídeo ou da playlist' })

/** The "Baixar" button of the options panel (the sidebar has a "Baixar" item too). */
export const downloadButton = (page: Page) =>
  page
    .getByRole('region', { name: 'Opções de download' })
    .getByRole('button', { name: 'Baixar', exact: true })

/** Types links into the top bar field and confirms with Enter, like pasting and analysing them. */
export async function submitUrl(page: Page, text: string) {
  const field = urlField(page)
  await field.fill(text)
  await field.press('Enter')
}

/** The run ids the app has handed to `bridge.run`, once there are at least `count` of them. */
export async function runIds(page: Page, count: number): Promise<string[]> {
  const read = () =>
    page.evaluate(() =>
      (window as unknown as Hooked).__e2e.calls
        .filter((c) => c.method === 'run')
        .map((c) => c.args[0] as string),
    )
  await expect.poll(async () => (await read()).length).toBeGreaterThanOrEqual(count)
  return read()
}

/** Plays yt-dlp: writes `lines` to a running job's stdout (or stderr). */
export function emit(page: Page, jobId: string, lines: string[], stream: 'stdout' | 'stderr') {
  return page.evaluate(
    ({ jobId, lines, stream }) => {
      for (const line of lines) {
        ;(window as unknown as Hooked).__e2e.emitLine({ jobId, stream, line })
      }
    },
    { jobId, lines, stream },
  )
}

/** Plays yt-dlp: the process ends with `code`. */
export function exit(page: Page, jobId: string, code: number) {
  return page.evaluate(
    ({ jobId, code }) => (window as unknown as Hooked).__e2e.emitExit({ jobId, code }),
    { jobId, code },
  )
}

/** The queue row holding a job with this title. */
export const queueRow = (page: Page, title: string): Locator =>
  page.getByRole('listitem').filter({ hasText: title })
