import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeProvider } from '../../bridge/context'
import { createMockBridge, type MockBridge } from '../../bridge/mock'
import { ToastProvider } from '../../components/Toast'
import { mapError } from '../../core/mapError'
import type { DownloadOptions, FriendlyError, ProgressEvent } from '../../core/types'
import i18n from '../../i18n'
import { renderApp } from '../../test/renderApp'
import { useDeps } from '../../stores/deps'
import { startScheduler, useQueue, type Job } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { maskArgs } from './ErrorDetails'
import { QueueScreen } from './index'

const MB = 1024 * 1024

function makeJob(n: number, over: Partial<Job> = {}): Job {
  return {
    id: `job${n}`,
    url: `https://youtu.be/v${n}`,
    title: `Video ${n}`,
    thumbnail: null,
    extractor: 'youtube',
    videoId: `v${n}`,
    args: ['--newline', `https://youtu.be/v${n}`],
    status: 'queued',
    attempt: 1,
    progress: null,
    phase: null,
    filePath: null,
    error: null,
    stderrTail: [],
    startedAt: null,
    finishedAt: null,
    ...over,
  }
}

const progress = (over: Partial<ProgressEvent> = {}): ProgressEvent => ({
  phase: 'downloading',
  percent: 42,
  speed: 2.4 * MB,
  eta: 80,
  totalBytes: 420 * MB,
  downloadedBytes: 176 * MB,
  ...over,
})

function setJobs(jobs: Job[]) {
  useQueue.setState({
    jobs,
    activeCount: jobs.filter((j) => j.status === 'active').length,
    terminating: [],
  })
}

async function setup(jobs: Job[], bridge: MockBridge = createMockBridge()) {
  await useSettings.getState().load(bridge)
  await useQueue.getState().load(bridge)
  setJobs(jobs)
  const user = userEvent.setup()
  render(
    <BridgeProvider bridge={bridge}>
      <ToastProvider>
        <QueueScreen />
      </ToastProvider>
    </BridgeProvider>,
  )
  return { user, bridge }
}

const errorJob = (
  n: number,
  e: Partial<FriendlyError> & Pick<FriendlyError, 'code'>,
  over: Partial<Job> = {},
) =>
  makeJob(n, {
    status: 'error',
    error: {
      titleKey: `errors.${e.code}.title`,
      messageKey: `errors.${e.code}.message`,
      lastLine: 'ERROR: boom',
      ...e,
    },
    ...over,
  })

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'queue', sidebarCollapsed: false })
  setJobs([])
})

describe('empty state', () => {
  it('says there is nothing in the queue', async () => {
    await setup([])
    expect(screen.getByText('Nenhum download na fila.')).toBeInTheDocument()
  })
})

describe('active job', () => {
  it('shows the bar, percent, speed, remaining time and size', async () => {
    await setup([makeJob(1, { status: 'active', phase: 'downloading', progress: progress() })])
    const bar = screen.getByRole('progressbar', { name: 'Video 1' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('2,4 MB/s')).toBeInTheDocument()
    expect(screen.getByText('1 min 20 s')).toBeInTheDocument()
    expect(screen.getByText('176 MB / 420 MB')).toBeInTheDocument()
    expect(screen.getByText('Baixando…')).toBeInTheDocument()
  })

  it('R10: without progress it shows an indeterminate bar and the phase, never 0%', async () => {
    await setup([makeJob(1, { status: 'active', phase: 'downloading', progress: null })])
    const bar = screen.getByRole('progressbar', { name: 'Video 1' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).toHaveAttribute('data-indeterminate', 'true')
    expect(screen.getByText('Baixando…')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('R10: a section download names the phase "Baixando trecho…"', async () => {
    await setup([
      makeJob(1, {
        status: 'active',
        phase: 'downloading',
        progress: null,
        args: ['--download-sections', '*0:10-0:20', 'https://youtu.be/v1'],
      }),
    ])
    expect(screen.getByText('Baixando trecho…')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('an unknown total (percent null) stays indeterminate but still shows the speed', async () => {
    await setup([
      makeJob(1, {
        status: 'active',
        phase: 'downloading',
        progress: progress({ percent: null, totalBytes: null, downloadedBytes: 5 * MB, eta: null }),
      }),
    ])
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(screen.getByText('2,4 MB/s')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('the merging phase says "Juntando vídeo e áudio" and has no percent', async () => {
    await setup([
      makeJob(1, {
        status: 'active',
        phase: 'merging',
        progress: progress({ phase: 'downloading', percent: 100 }),
      }),
    ])
    expect(screen.getByText('Juntando vídeo e áudio')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-indeterminate', 'true')
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('the postprocessing phase is named', async () => {
    await setup([makeJob(1, { status: 'active', phase: 'postprocessing' })])
    expect(screen.getByText('Pós-processando…')).toBeInTheDocument()
  })

  it('cancels the job', async () => {
    const { user } = await setup([makeJob(1, { status: 'active', phase: 'downloading' })])
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(useQueue.getState().jobs[0].status).toBe('cancelled')
  })
})

describe('other states', () => {
  it('labels queued, cancelled and interrupted jobs', async () => {
    await setup([
      makeJob(1, { status: 'queued' }),
      makeJob(2, { status: 'cancelled' }),
      makeJob(3, { status: 'interrupted' }),
    ])
    expect(screen.getByText('Na fila')).toBeInTheDocument()
    expect(screen.getByText('Cancelado')).toBeInTheDocument()
    expect(screen.getByText('Interrompido')).toBeInTheDocument()
  })

  it('retries a cancelled job and removes an interrupted one', async () => {
    const { user } = await setup([
      makeJob(1, { status: 'cancelled' }),
      makeJob(2, { status: 'interrupted' }),
    ])
    const rows = screen.getAllByRole('listitem')
    await user.click(within(rows[0]).getByRole('button', { name: 'Tentar de novo' }))
    expect(useQueue.getState().jobs[0].status).toBe('queued')
    await user.click(within(rows[1]).getByRole('button', { name: 'Remover' }))
    expect(useQueue.getState().jobs.map((j) => j.id)).toEqual(['job1'])
  })

  it('"Limpar concluídos" drops finished jobs but keeps interrupted ones', async () => {
    const { user } = await setup([
      makeJob(1, { status: 'done' }),
      makeJob(2, { status: 'interrupted' }),
      makeJob(3, { status: 'queued' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Limpar concluídos' }))
    expect(useQueue.getState().jobs.map((j) => j.id)).toEqual(['job2', 'job3'])
  })

  it('has no "Limpar concluídos" when nothing is finished', async () => {
    await setup([makeJob(1, { status: 'queued' })])
    expect(screen.queryByRole('button', { name: 'Limpar concluídos' })).not.toBeInTheDocument()
  })
})

describe('done job', () => {
  it('opens the file and reveals it in the folder', async () => {
    const { user, bridge } = await setup([
      makeJob(1, { status: 'done', filePath: 'C:\\Videos\\a.mp4' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: 'Mostrar na pasta' }))
    expect(
      bridge.calls.filter((c) => c.method === 'os.openPath' || c.method === 'os.revealPath'),
    ).toEqual([
      { method: 'os.openPath', args: ['C:\\Videos\\a.mp4'] },
      { method: 'os.revealPath', args: ['C:\\Videos\\a.mp4'] },
    ])
  })

  it('hides both when the file path is unknown', async () => {
    await setup([makeJob(1, { status: 'done', filePath: null })])
    expect(screen.getByText('Concluído')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostrar na pasta' })).not.toBeInTheDocument()
  })

  it('removes a finished job', async () => {
    const { user } = await setup([makeJob(1, { status: 'done' })])
    await user.click(screen.getByRole('button', { name: 'Remover' }))
    expect(useQueue.getState().jobs).toEqual([])
  })
})

describe('error job', () => {
  it('shows the translated title and message', async () => {
    await setup([errorJob(1, { code: 'geo', action: 'set_proxy' })])
    expect(screen.getByText('Indisponível na sua região')).toBeInTheDocument()
    expect(screen.getByText(/Um proxy nas Configurações pode ajudar/)).toBeInTheDocument()
  })

  it('shows the generic retry button when the error offers no action', async () => {
    await setup([errorJob(1, { code: 'unsupported' })])
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('update_ytdlp updates on the settings channel, toasts the version and offers a retry', async () => {
    const bridge = createMockBridge({ updateVersion: '2026.10.01' })
    const { user } = await setup(
      [errorJob(1, { code: 'extractor', action: 'update_ytdlp' })],
      bridge,
    )
    useSettings.getState().update({ channel: 'nightly' })
    await user.click(screen.getByRole('button', { name: 'Atualizar yt-dlp' }))
    expect(bridge.calls.find((c) => c.method === 'deps.update')?.args).toEqual(['nightly'])
    expect(await screen.findByText('yt-dlp atualizado para 2026.10.01')).toBeInTheDocument()
    expect(useQueue.getState().jobs[0].status).toBe('error')
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(useQueue.getState().jobs[0].status).toBe('queued')
  })

  it.each(['use_cookies', 'set_proxy'] as const)('%s goes to the settings', async (action) => {
    const { user } = await setup([errorJob(1, { code: 'private', action })])
    await user.click(
      screen.getByRole('button', {
        name: action === 'use_cookies' ? 'Usar cookies do navegador' : 'Configurar proxy',
      }),
    )
    expect(useUi.getState().screen).toBe('settings')
    // ...and to the section that holds the fix
    expect(useUi.getState().settingsSection).toBe(action === 'use_cookies' ? 'access' : 'network')
  })

  it('update_ytdlp and reinstall_ffmpeg refresh the engine status shown in the sidebar', async () => {
    const bridge = createMockBridge({ deps: { ytdlp: null, ffmpeg: null, deno: null } })
    const { user } = await setup(
      [
        errorJob(1, { code: 'extractor', action: 'update_ytdlp' }),
        errorJob(2, { code: 'ffmpeg', action: 'reinstall_ffmpeg' }),
      ],
      bridge,
    )
    useDeps.setState({ status: null })
    await user.click(screen.getByRole('button', { name: 'Atualizar yt-dlp' }))
    await waitFor(() => expect(useDeps.getState().status?.ytdlp?.version).toBe('2099.01.01'))
    await user.click(screen.getByRole('button', { name: 'Reinstalar ffmpeg' }))
    await waitFor(() => expect(useDeps.getState().status?.ffmpeg?.version).toBe('mock-ffmpeg'))
  })

  it.each(['retry', 'retry_later'] as const)('%s retries the job', async (action) => {
    const { user } = await setup([errorJob(1, { code: 'rate_limit', action })])
    const name = action === 'retry' ? 'Tentar de novo' : 'Tentar de novo mais tarde'
    // the action button is the retry: no second generic one next to it
    expect(screen.getAllByRole('button', { name: /^Tentar de novo/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name }))
    expect(useQueue.getState().jobs[0].status).toBe('queued')
  })

  it('reinstall_ffmpeg installs ffmpeg and then retries', async () => {
    const { user, bridge } = await setup([
      errorJob(1, { code: 'ffmpeg', action: 'reinstall_ffmpeg' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Reinstalar ffmpeg' }))
    await screen.findByText('Na fila')
    expect(bridge.calls.find((c) => c.method === 'deps.install')?.args).toEqual(['ffmpeg'])
    expect(useQueue.getState().jobs[0].status).toBe('queued')
  })

  describe('actions that change the command rebuild it', () => {
    const OPTS: DownloadOptions = {
      mode: 'video',
      video: { maxHeight: 1080, container: 'mp4' },
      embedThumbnail: true,
      embedMetadata: true,
      embedChapters: true,
    }
    const DEPS = {
      ytdlp: { path: '/bin/yt-dlp', version: '1' },
      ffmpeg: { path: '/bin/ffmpeg', version: '1', source: 'app' as const },
      deno: { path: '/bin/deno', version: '1', source: 'app' as const },
    }

    async function run(action: 'use_firefox' | 'choose_folder', name: string) {
      const bridge = createMockBridge({ deps: DEPS, pickedFolder: 'D:\\Novo' })
      const { user } = await setup(
        [
          errorJob(
            1,
            { code: 'disk', action },
            { opts: OPTS, args: ['--old', 'https://youtu.be/v1'] },
          ),
        ],
        bridge,
      )
      const stop = await startScheduler(bridge)
      await user.click(screen.getByRole('button', { name }))
      await vi.waitFor(() => expect(bridge.calls.some((c) => c.method === 'run')).toBe(true))
      stop()
      return bridge.calls.find((c) => c.method === 'run')?.args[1] as string[]
    }

    it('use_firefox: the retried command carries --cookies-from-browser firefox', async () => {
      const args = await run('use_firefox', 'Usar Firefox')
      expect(args).not.toContain('--old')
      expect(args.join(' ')).toContain('--cookies-from-browser firefox')
    })

    it('choose_folder: the retried command uses the new -P folder', async () => {
      const args = await run('choose_folder', 'Escolher outra pasta')
      expect(args).not.toContain('--old')
      expect(args[args.indexOf('-P') + 1]).toBe('D:\\Novo')
    })
  })

  it('use_firefox switches the cookies browser and retries', async () => {
    const { user } = await setup([errorJob(1, { code: 'cookies_chrome', action: 'use_firefox' })])
    await user.click(screen.getByRole('button', { name: 'Usar Firefox' }))
    expect(useSettings.getState().settings.cookiesBrowser).toBe('firefox')
    expect(useQueue.getState().jobs[0].status).toBe('queued')
  })

  it('choose_folder sets the output folder and retries when a folder is picked', async () => {
    const bridge = createMockBridge({ pickedFolder: 'D:\\Downloads' })
    const { user } = await setup([errorJob(1, { code: 'disk', action: 'choose_folder' })], bridge)
    await user.click(screen.getByRole('button', { name: 'Escolher outra pasta' }))
    expect(useSettings.getState().settings.outputDir).toBe('D:\\Downloads')
    expect(useQueue.getState().jobs[0].status).toBe('queued')
  })

  it('choose_folder does nothing when the dialog is cancelled', async () => {
    const { user } = await setup([errorJob(1, { code: 'disk', action: 'choose_folder' })])
    const before = useSettings.getState().settings.outputDir
    await user.click(screen.getByRole('button', { name: 'Escolher outra pasta' }))
    expect(useSettings.getState().settings.outputDir).toBe(before)
    expect(useQueue.getState().jobs[0].status).toBe('error')
  })

  it('a failing action is reported in a toast and the job stays in error', async () => {
    const bridge = createMockBridge()
    bridge.deps.update = () => Promise.reject(new Error('offline'))
    const { user } = await setup(
      [errorJob(1, { code: 'extractor', action: 'update_ytdlp' })],
      bridge,
    )
    await user.click(screen.getByRole('button', { name: 'Atualizar yt-dlp' }))
    expect(await screen.findByText('A ação falhou: offline')).toBeInTheDocument()
    expect(useQueue.getState().jobs[0].status).toBe('error')
  })
})

describe('technical details', () => {
  const args = [
    '--newline',
    '--cookies-from-browser',
    'firefox',
    '--proxy',
    'http://user:secret@proxy:8080',
    '-o',
    'C:\\My Videos\\%(title)s.%(ext)s',
    'https://youtu.be/v1',
  ]
  const stderrTail = ['WARNING: x', 'ERROR: boom']

  async function open() {
    const bridge = createMockBridge()
    const ctx = await setup([errorJob(1, { code: 'unknown' }, { args, stderrTail })], bridge)
    const trigger = screen.getByRole('button', { name: 'Ver detalhes técnicos' })
    await ctx.user.click(trigger)
    return { ...ctx, bridge, trigger, dialog: await screen.findByRole('dialog') }
  }

  it('shows the command with cookies and proxy masked, plus the stderr', async () => {
    const { dialog } = await open()
    const command = within(dialog).getByTestId('command')
    expect(command).toHaveTextContent(
      'yt-dlp --newline --cookies-from-browser ••• --proxy ••• -o "C:\\My Videos\\%(title)s.%(ext)s" https://youtu.be/v1',
    )
    expect(dialog).not.toHaveTextContent('secret')
    expect(dialog).not.toHaveTextContent('firefox')
    expect(within(dialog).getByTestId('stderr')).toHaveTextContent('WARNING: x ERROR: boom')
  })

  it('"Copiar" writes exactly the masked text to the clipboard', async () => {
    const { user, dialog, bridge } = await open()
    await user.click(within(dialog).getByRole('button', { name: 'Copiar' }))
    const write = bridge.calls.find((c) => c.method === 'os.writeClipboard')
    const text = write?.args[0] as string
    expect(text).toContain('yt-dlp --newline --cookies-from-browser ••• --proxy •••')
    expect(text).toContain('ERROR: boom')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('firefox')
    expect(await screen.findByText('Copiado')).toBeInTheDocument()
  })

  it('closes with Escape and gives the focus back to the link', async () => {
    const { user, trigger } = await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('masks credentials that yt-dlp echoes in stderr', async () => {
    const { user } = await setup([
      errorJob(
        1,
        { code: 'network' },
        { stderrTail: ['ERROR: proxy http://user:secret@proxy:8080 refused'] },
      ),
    ])
    await user.click(screen.getByRole('button', { name: 'Ver detalhes técnicos' }))
    expect(await screen.findByRole('dialog')).not.toHaveTextContent('secret')
  })
})

describe('maskArgs', () => {
  it('masks the value after the flag, and the --flag=value form', () => {
    expect(maskArgs(['--proxy', 'http://p', '-x', '--cookies-from-browser=chrome'])).toEqual([
      '--proxy',
      '•••',
      '-x',
      '--cookies-from-browser=•••',
    ])
  })

  it('keeps a flag that ends the list', () => {
    expect(maskArgs(['--proxy'])).toEqual(['--proxy'])
  })
})

describe('top bar badge and sidebar', () => {
  const shell = () => renderApp(createMockBridge(), null)

  it('shows the active count in the top bar and "N ativos" in the sidebar', () => {
    setJobs([
      makeJob(1, { status: 'active' }),
      makeJob(2, { status: 'active' }),
      makeJob(3, { status: 'queued' }),
    ])
    shell()
    expect(screen.getByRole('button', { name: '2 downloads ativos' })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /^Fila/ })).toHaveTextContent('2 ativos')
  })

  it('uses the singular for one active download', () => {
    setJobs([makeJob(1, { status: 'active' })])
    shell()
    expect(screen.getByRole('button', { name: '1 download ativo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Fila/ })).toHaveTextContent('1 ativo')
  })

  it('both disappear when nothing is active', () => {
    setJobs([makeJob(1, { status: 'queued' })])
    shell()
    expect(screen.queryByRole('button', { name: /downloads? ativos?/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fila' })).not.toHaveTextContent('ativo')
  })

  it('follows the count live', () => {
    setJobs([])
    shell()
    expect(screen.queryByRole('button', { name: /download ativo/ })).not.toBeInTheDocument()
    act(() => setJobs([makeJob(1, { status: 'active' })]))
    expect(screen.getByRole('button', { name: '1 download ativo' })).toBeInTheDocument()
  })

  it('clicking the badge opens the queue', async () => {
    setJobs([makeJob(1, { status: 'active' })])
    useUi.setState({ screen: 'download' })
    shell()
    await userEvent.click(screen.getByRole('button', { name: '1 download ativo' }))
    expect(useUi.getState().screen).toBe('queue')
  })
})

describe('mapError integration', () => {
  it('renders a real mapped error (rate limit)', async () => {
    const e = mapError(['ERROR: HTTP Error 429: Too Many Requests'])
    await setup([makeJob(1, { status: 'error', error: e })])
    expect(screen.getByText('Muitas requisições')).toBeInTheDocument()
  })
})
