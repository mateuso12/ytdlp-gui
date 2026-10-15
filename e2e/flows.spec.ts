import {
  AGE_ERROR_LINES,
  AMBIGUOUS_URL,
  downloadButton,
  emit,
  exit,
  expect,
  LAST_PROGRESS,
  nav,
  PLAYLIST_URL,
  PROGRESS_LINES,
  queueRow,
  runIds,
  submitUrl,
  test,
  VIDEO_TITLE,
  VIDEO_URL,
} from './support'

test('paste a video, download it, watch it reach 100% and find it in the history', async ({
  page,
}) => {
  await submitUrl(page, VIDEO_URL)
  await expect(page.getByRole('heading', { name: VIDEO_TITLE })).toBeVisible()
  await downloadButton(page).click()

  // The download lands in the queue and the scheduler starts it.
  const [jobId] = await runIds(page, 1)
  const bar = page.getByRole('progressbar', { name: VIDEO_TITLE })
  await expect(bar).toHaveAttribute('data-indeterminate', 'true')

  // The real yt-dlp output of a video+audio download, up to the last progress line.
  await emit(page, jobId, PROGRESS_LINES.slice(0, LAST_PROGRESS + 1), 'stdout')
  await expect(bar).toHaveAttribute('aria-valuenow', '100')
  const row = queueRow(page, VIDEO_TITLE)
  await expect(row.getByText('100%')).toBeVisible()

  // Merging, the output file, and a clean exit.
  await emit(page, jobId, PROGRESS_LINES.slice(LAST_PROGRESS + 1), 'stdout')
  await exit(page, jobId, 0)
  await expect(row.getByText('Concluído')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Mostrar na pasta' })).toBeVisible()

  await nav(page, 'Histórico').click()
  const history = page.getByRole('list', { name: 'Downloads concluídos' })
  await expect(history.getByText(VIDEO_TITLE)).toBeVisible()
})

test('playlist: select 3 items and 3 jobs appear in the queue', async ({ page }) => {
  await submitUrl(page, PLAYLIST_URL)
  await expect(page.getByRole('heading', { name: 'Settlers' })).toBeVisible()

  const summary = page.getByTestId('selection-summary')
  await expect(summary).toContainText('8 selecionados')

  await page.getByRole('button', { name: 'Intervalo…' }).click()
  await page.getByRole('textbox', { name: 'Intervalo' }).fill('1-3')
  await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
  await expect(summary).toContainText('3 selecionados')

  await page.getByRole('button', { name: 'Baixar 3', exact: true }).click()

  await expect(nav(page, 'Fila')).toHaveAttribute('aria-current', 'page')
  const list = page.getByRole('list', { name: 'Downloads' })
  await expect(list.getByRole('listitem')).toHaveCount(3)
  // Concurrency is 2: two start now, the third waits its turn.
  await runIds(page, 2)
  await expect(list.getByText('Na fila')).toHaveCount(1)
})

test('ambiguous link: "Só este vídeo" analyses the video alone', async ({ page }) => {
  await submitUrl(page, AMBIGUOUS_URL)
  await expect(page.getByRole('radio', { name: /^Playlist inteira · \d+$/ })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Settlers' })).toBeVisible()

  await page.getByText('Só este vídeo').click()

  await expect(page.getByRole('heading', { name: VIDEO_TITLE })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Só este vídeo' })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Settlers' })).toHaveCount(0)
})

test('error: the failed download offers the suggested action', async ({ page }) => {
  await submitUrl(page, VIDEO_URL)
  await expect(page.getByRole('heading', { name: VIDEO_TITLE })).toBeVisible()
  await downloadButton(page).click()
  const [jobId] = await runIds(page, 1)

  await emit(page, jobId, AGE_ERROR_LINES, 'stderr')
  await exit(page, jobId, 1)

  const row = queueRow(page, VIDEO_TITLE)
  await expect(row.getByText('Vídeo com restrição de idade')).toBeVisible()

  // The suggested action takes the user to the cookies setting.
  await row.getByRole('button', { name: 'Usar cookies do navegador' }).click()
  await expect(nav(page, 'Configurações')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Cookies do navegador').first()).toBeVisible()
})
