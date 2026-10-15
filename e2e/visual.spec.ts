import type { Page } from '@playwright/test'
import {
  AGE_ERROR_LINES,
  downloadButton,
  emit,
  exit,
  expect,
  nav,
  PLAYLIST_URL,
  PROGRESS_LINES,
  runIds,
  submitUrl,
  test,
  VIDEO_TITLE,
  VIDEO_URL,
} from './support'

// Screenshot baselines of the main screens at 1280x800, light and dark. Playwright keeps them per
// platform, so they are generated and checked locally only (`pnpm e2e:visual`, `pnpm e2e:update`);
// CI runs the `flows` project alone. Everything the page shows is deterministic: the mock bridge,
// real yt-dlp fixtures, placeholder thumbnails and a fixed locale and time zone.

/** Waits for the layout to settle, parks the pointer away from hover states, and compares. */
async function expectScreen(page: Page, name: string, theme: string) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
  await expect(page).toHaveScreenshot(`${name}-${theme}.png`)
}

/** A progress line of the first (video) stream of the real download, picked by its percentage. */
const progressAt = (percentStr: string) => {
  const line = PROGRESS_LINES.find((l) => l.includes(`"_percent_str": "${percentStr}"`))
  if (!line) throw new Error(`no progress line at ${percentStr}`)
  return line
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    test('Baixar: video', async ({ page }) => {
      await submitUrl(page, VIDEO_URL)
      await expect(page.getByRole('heading', { name: VIDEO_TITLE })).toBeVisible()
      await expect(downloadButton(page)).toBeVisible()
      await expectScreen(page, 'download-video', theme)
    })

    test('Baixar: playlist', async ({ page }) => {
      await submitUrl(page, PLAYLIST_URL)
      await expect(page.getByRole('heading', { name: 'Settlers' })).toBeVisible()
      await expect(page.getByTestId('selection-summary')).toContainText('8 selecionados')
      await expectScreen(page, 'download-playlist', theme)
    })

    test('Fila', async ({ page }) => {
      await submitUrl(page, PLAYLIST_URL)
      await page.getByRole('button', { name: 'Intervalo…' }).click()
      await page.getByRole('textbox', { name: 'Intervalo' }).fill('1-4')
      await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
      await page.getByRole('button', { name: 'Baixar 4', exact: true }).click()
      await expect(nav(page, 'Fila')).toHaveAttribute('aria-current', 'page')

      // Two jobs run: the first is downloading, the second fails; then the third takes its place.
      const [first, second] = await runIds(page, 2)
      await emit(page, first, [progressAt(' 48.5%')], 'stdout')
      await emit(page, second, AGE_ERROR_LINES, 'stderr')
      await exit(page, second, 1)
      const [, , third] = await runIds(page, 3)
      await emit(page, third, [progressAt(' 12.1%')], 'stdout')

      const list = page.getByRole('list', { name: 'Downloads' })
      await expect(list.getByRole('listitem')).toHaveCount(4)
      await expect(list.getByText('48%')).toBeVisible()
      await expect(list.getByText('Vídeo com restrição de idade')).toBeVisible()
      await expect(list.getByText('12%')).toBeVisible()
      await expect(list.getByText('Na fila')).toBeVisible()
      // The "added to queue" toast would otherwise be caught half-way through leaving.
      await expect(page.getByText('Adicionado à fila', { exact: true })).toBeHidden({
        timeout: 10_000,
      })
      await expectScreen(page, 'queue', theme)
    })

    test('Configurações', async ({ page }) => {
      await nav(page, 'Configurações').click()
      await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible()
      await expectScreen(page, 'settings', theme)
    })
  })
}
