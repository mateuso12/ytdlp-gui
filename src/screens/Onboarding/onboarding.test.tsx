import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { BridgeProvider } from '../../bridge/context'
import { createMockBridge, type MockBridge } from '../../bridge/mock'
import type { DepName } from '../../bridge/types'
import i18n from '../../i18n'
import { useDeps } from '../../stores/deps'
import { useQueue } from '../../stores/queue'
import { useUi } from '../../stores/ui'
import { ALL_INSTALLED } from '../../test/fixtures'
import { ProbeProvider } from '../Download/ProbeProvider'
import { UrlField } from '../Download/UrlField'

const MB = 1024 * 1024

interface Deferred {
  promise: Promise<void>
  resolve(): void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function release(gates: Map<DepName, Deferred>, which: DepName) {
  const gate = gates.get(which)
  if (!gate) throw new Error(`${which} was not started`)
  gate.resolve()
}

/**
 * Puts a hook in front of `deps.install`: `started` lists the tools whose install began, in
 * order, and `hook` decides when (and whether) each one finishes. The mock still marks the tool
 * as installed afterwards.
 */
function controlInstalls(bridge: MockBridge, hook: (which: DepName) => Promise<void> | void) {
  const started: DepName[] = []
  const original = bridge.deps.install
  bridge.deps.install = async (which) => {
    started.push(which)
    await hook(which)
    return original(which)
  }
  return started
}

/** The shell with the same providers and link field as `main.tsx`, optionally under StrictMode. */
function renderShell(bridge: MockBridge, { strict = false } = {}) {
  const tree = (
    <BridgeProvider bridge={bridge}>
      <ProbeProvider>
        <App urlSlot={<UrlField />} />
      </ProbeProvider>
    </BridgeProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const installCalls = (b: MockBridge) =>
  b.calls.filter((c) => c.method === 'deps.install').map((c) => c.args[0])

const setupTitle = () => screen.findByRole('heading', { level: 1, name: 'Preparando o motor' })
const downloadTitle = () => screen.findByRole('heading', { level: 1, name: 'Baixar' })

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useDeps.setState({ status: null, failed: false })
  useUi.setState({ screen: 'download', sidebarCollapsed: false })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('first run: engine setup', () => {
  it('installs yt-dlp, ffmpeg and Deno in that order, one at a time, with per-tool progress', async () => {
    const bridge = createMockBridge()
    const gates = new Map<DepName, Deferred>()
    const started = controlInstalls(bridge, (which) => {
      const gate = deferred()
      gates.set(which, gate)
      return gate.promise
    })
    renderShell(bridge)

    expect(await setupTitle()).toBeInTheDocument()
    await waitFor(() => expect(started).toEqual(['ytdlp']))

    act(() => bridge.emitDepsProgress({ which: 'ytdlp', received: 5 * MB, total: 20 * MB }))
    const ytdlpBar = screen.getByRole('progressbar', { name: 'Instalando yt-dlp' })
    expect(ytdlpBar).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByRole('status')).toHaveTextContent('Instalando yt-dlp')
    // the next tool waits for the previous one
    expect(started).toEqual(['ytdlp'])

    await act(async () => release(gates, 'ytdlp'))
    await waitFor(() => expect(started).toEqual(['ytdlp', 'ffmpeg']))
    expect(screen.queryByRole('progressbar', { name: 'Instalando yt-dlp' })).not.toBeInTheDocument()

    // no total: indeterminate, never a made-up percentage
    act(() => bridge.emitDepsProgress({ which: 'ffmpeg', received: 3 * MB, total: null }))
    const ffmpegBar = screen.getByRole('progressbar', { name: 'Instalando ffmpeg' })
    expect(ffmpegBar).not.toHaveAttribute('aria-valuenow')
    expect(ffmpegBar).toHaveAttribute('data-indeterminate', 'true')

    await act(async () => release(gates, 'ffmpeg'))
    await waitFor(() => expect(started).toEqual(['ytdlp', 'ffmpeg', 'deno']))
    await act(async () => release(gates, 'deno'))

    expect(await downloadTitle()).toBeInTheDocument()
    expect(screen.queryByText('Preparando o motor')).not.toBeInTheDocument()
    expect(installCalls(bridge)).toEqual(['ytdlp', 'ffmpeg', 'deno'])
  })

  it('installs only what is missing: a system ffmpeg (and an installed Deno) are left alone', async () => {
    const bridge = createMockBridge({
      deps: {
        ytdlp: null,
        ffmpeg: { path: 'C:\\ffmpeg\\ffmpeg.exe', version: '7.1', source: 'system' },
        deno: { path: '/bin/deno', version: '2.0.0', source: 'app' },
      },
    })
    renderShell(bridge)
    expect(await downloadTitle()).toBeInTheDocument()
    expect(installCalls(bridge)).toEqual(['ytdlp'])
  })

  it('installs Deno when it is the only thing missing', async () => {
    const bridge = createMockBridge({ deps: { ...ALL_INSTALLED, deno: null } })
    renderShell(bridge)
    expect(await downloadTitle()).toBeInTheDocument()
    expect(installCalls(bridge)).toEqual(['deno'])
  })

  it('never shows the setup screen when everything is installed', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    renderShell(bridge)
    expect(await downloadTitle()).toBeInTheDocument()
    expect(screen.queryByText('Preparando o motor')).not.toBeInTheDocument()
    expect(installCalls(bridge)).toEqual([])
  })

  it('shows a short loading state until the first status answer arrives', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const answer = deferred()
    const original = bridge.deps.status
    bridge.deps.status = async () => {
      await answer.promise
      return original()
    }
    renderShell(bridge)
    expect(screen.getByRole('status')).toHaveTextContent('Verificando o motor')
    expect(screen.queryByRole('heading', { level: 1, name: 'Baixar' })).not.toBeInTheDocument()
    await act(async () => answer.resolve())
    expect(await downloadTitle()).toBeInTheDocument()
  })

  it('shows only the neutral checking line (no first-run copy) while the status is unknown', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const answer = deferred()
    const original = bridge.deps.status
    bridge.deps.status = async () => {
      await answer.promise
      return original()
    }
    renderShell(bridge)
    expect(screen.getByRole('status')).toHaveTextContent('Verificando o motor')
    expect(screen.queryByText('Preparando o motor')).not.toBeInTheDocument()
    expect(screen.queryByText(/Só na primeira vez/)).not.toBeInTheDocument()
    await act(async () => answer.resolve())
    expect(await downloadTitle()).toBeInTheDocument()
  })

  it('offers a visible retry when the first status read fails, and recovers', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const original = bridge.deps.status
    bridge.deps.status = () => Promise.reject(new Error('x'))
    const user = userEvent.setup()
    renderShell(bridge)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível verificar')
    bridge.deps.status = original
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await downloadTitle()).toBeInTheDocument()
  })

  it('lands on the Download screen with the focus on the link field when it finishes', async () => {
    useUi.setState({ screen: 'settings' })
    renderShell(createMockBridge())
    const field = await screen.findByRole('textbox', { name: 'Link do vídeo ou da playlist' })
    expect(screen.getByRole('heading', { level: 1, name: 'Baixar' })).toBeInTheDocument()
    expect(field).toHaveFocus()
  })

  it('does not install anything twice under StrictMode double effects', async () => {
    const bridge = createMockBridge()
    const started = controlInstalls(bridge, () => Promise.resolve())
    renderShell(bridge, { strict: true })
    expect(await downloadTitle()).toBeInTheDocument()
    expect(started).toEqual(['ytdlp', 'ffmpeg', 'deno'])
  })

  it('unsubscribes from every progress subscription it made', async () => {
    const bridge = createMockBridge()
    const gate = deferred()
    controlInstalls(bridge, () => gate.promise)
    let subscribed = 0
    let unsubscribed = 0
    const original = bridge.deps.onProgress
    bridge.deps.onProgress = async (cb) => {
      subscribed++
      const off = await original(cb)
      return () => {
        unsubscribed++
        off()
      }
    }
    const view = renderShell(bridge, { strict: true })
    await screen.findByRole('progressbar', { name: 'Instalando yt-dlp' })
    view.unmount()
    await waitFor(() => expect(unsubscribed).toBe(subscribed))
    expect(subscribed).toBeGreaterThan(0)
  })
})

describe('first run: failures', () => {
  it('a failed step shows the problem and "Tentar de novo" repeats only that step, then continues', async () => {
    const bridge = createMockBridge()
    let ffmpegAttempts = 0
    const started = controlInstalls(bridge, (which) => {
      if (which === 'ffmpeg' && ffmpegAttempts++ === 0) throw new Error('network down')
    })
    const user = userEvent.setup()
    renderShell(bridge)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ffmpeg')
    expect(alert).toHaveTextContent('conexão')
    expect(started).toEqual(['ytdlp', 'ffmpeg'])
    // the step that already worked stays listed
    expect(
      within(screen.getByRole('list', { name: 'Ferramentas do motor' })).getByText('yt-dlp'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await downloadTitle()).toBeInTheDocument()
    expect(started).toEqual(['ytdlp', 'ffmpeg', 'ffmpeg', 'deno'])
  })

  it('a failure in the first step retries that step and then installs the rest', async () => {
    const bridge = createMockBridge()
    let attempts = 0
    const started = controlInstalls(bridge, (which) => {
      if (which === 'ytdlp' && attempts++ === 0) throw new Error('offline')
    })
    const user = userEvent.setup()
    renderShell(bridge)
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await downloadTitle()).toBeInTheDocument()
    expect(started).toEqual(['ytdlp', 'ytdlp', 'ffmpeg', 'deno'])
  })

  it('stays on the setup screen, with the retry, while the failure continues', async () => {
    const bridge = createMockBridge()
    const started = controlInstalls(bridge, () => {
      throw new Error('offline')
    })
    const user = userEvent.setup()
    renderShell(bridge)
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(started).toEqual(['ytdlp', 'ytdlp']))
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(await setupTitle()).toBeInTheDocument()
  })

  it('a status read that fails entirely shows the setup screen with a retry, not a dead end', async () => {
    const bridge = createMockBridge()
    const original = bridge.deps.status
    let reads = 0
    bridge.deps.status = async () => {
      if (reads++ === 0) throw new Error('boom')
      return original()
    }
    const user = userEvent.setup()
    renderShell(bridge)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível verificar')
    expect(installCalls(bridge)).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await downloadTitle()).toBeInTheDocument()
    expect(installCalls(bridge)).toEqual(['ytdlp', 'ffmpeg', 'deno'])
  })
})

describe('app update banner', () => {
  const withUpdate = (version = '2026.11.0') =>
    createMockBridge({ deps: ALL_INSTALLED, update: { version } })
  const bannerName = 'Atualização do app'

  it('offers the new version and installs only after the click', async () => {
    const bridge = withUpdate()
    const user = userEvent.setup()
    renderShell(bridge)

    const banner = await screen.findByRole('region', { name: bannerName })
    expect(banner).toHaveTextContent('Nova versão 2026.11.0 disponível')
    expect(bridge.calls.some((c) => c.method === 'updater.check')).toBe(true)
    expect(bridge.calls.some((c) => c.method === 'updater.install')).toBe(false)

    await user.click(within(banner).getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(bridge.calls.some((c) => c.method === 'updater.install')).toBe(true))
  })

  it('warns and asks for a second click when downloads are running', async () => {
    const bridge = withUpdate()
    const user = userEvent.setup()
    renderShell(bridge)
    const banner = await screen.findByRole('region', { name: bannerName })
    act(() => useQueue.setState({ activeCount: 2 }))
    await user.click(within(banner).getByRole('button', { name: 'Atualizar' }))
    expect(within(banner).getByRole('alert')).toHaveTextContent('downloads em andamento')
    expect(bridge.calls.some((c) => c.method === 'updater.install')).toBe(false)
    await user.click(within(banner).getByRole('button', { name: 'Atualizar mesmo assim' }))
    await waitFor(() => expect(bridge.calls.some((c) => c.method === 'updater.install')).toBe(true))
    act(() => useQueue.setState({ activeCount: 0 }))
  })

  it('is not modal: the app stays usable and the banner can be dismissed', async () => {
    const bridge = withUpdate()
    const user = userEvent.setup()
    renderShell(bridge)
    const banner = await screen.findByRole('region', { name: bannerName })
    expect(screen.getByRole('heading', { level: 1, name: 'Baixar' })).toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByRole('region', { name: bannerName })).not.toBeInTheDocument()
    expect(bridge.calls.some((c) => c.method === 'updater.install')).toBe(false)
  })

  it('disables the button while installing', async () => {
    const bridge = withUpdate()
    const gate = deferred()
    bridge.updater.check = async () => ({ version: '2026.11.0', install: () => gate.promise })
    const user = userEvent.setup()
    renderShell(bridge)
    const banner = await screen.findByRole('region', { name: bannerName })
    await user.click(within(banner).getByRole('button', { name: 'Atualizar' }))
    const busy = await within(banner).findByRole('button', { name: 'Atualizando…' })
    expect(busy).toBeDisabled()
    await act(async () => gate.resolve())
  })

  it('reports a failed install in a toast and lets the user try again', async () => {
    const bridge = withUpdate()
    let attempts = 0
    bridge.updater.check = async () => ({
      version: '2026.11.0',
      install: async () => {
        if (attempts++ === 0) throw new Error('signature mismatch')
      },
    })
    const user = userEvent.setup()
    renderShell(bridge)
    const banner = await screen.findByRole('region', { name: bannerName })
    await user.click(within(banner).getByRole('button', { name: 'Atualizar' }))
    expect(
      await screen.findByText('Não foi possível atualizar o app. Tente de novo mais tarde.'),
    ).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Atualizar' })).toBeEnabled()
  })

  it('says the update is installed, with no button left, once the install finishes', async () => {
    const bridge = withUpdate()
    const user = userEvent.setup()
    renderShell(bridge)
    const banner = await screen.findByRole('region', { name: bannerName })
    await user.click(within(banner).getByRole('button', { name: 'Atualizar' }))
    expect(await within(banner).findByText(/Atualização instalada/)).toBeInTheDocument()
    expect(within(banner).queryByRole('button', { name: 'Atualizar' })).not.toBeInTheDocument()
  })

  it('treats a rejected check (updater not configured) as "no update", with no visible error', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const check = vi.fn(() => Promise.reject(new Error('updater is not configured')))
    bridge.updater.check = check
    renderShell(bridge)
    expect(await downloadTitle()).toBeInTheDocument()
    await waitFor(() => expect(check).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: bannerName })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/updater|atualizar o app/i)).not.toBeInTheDocument()
  })

  it('shows nothing when the app is up to date', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    renderShell(bridge)
    expect(await downloadTitle()).toBeInTheDocument()
    await waitFor(() => expect(bridge.calls.some((c) => c.method === 'updater.check')).toBe(true))
    expect(screen.queryByRole('region', { name: bannerName })).not.toBeInTheDocument()
  })
})

describe('deps store', () => {
  it('flags a failed read and clears the flag once a read works', async () => {
    const bridge = createMockBridge({ deps: ALL_INSTALLED })
    const original = bridge.deps.status
    bridge.deps.status = () => Promise.reject(new Error('x'))
    await useDeps.getState().refresh(bridge)
    expect(useDeps.getState()).toMatchObject({ status: null, failed: true })
    bridge.deps.status = original
    await useDeps.getState().refresh(bridge)
    expect(useDeps.getState().failed).toBe(false)
    expect(useDeps.getState().status?.ytdlp).not.toBeNull()
  })
})
