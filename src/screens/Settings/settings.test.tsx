import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as theme from '../../app/theme'
import { BridgeProvider } from '../../bridge/context'
import { createMockBridge, type MockBridge, type MockScript } from '../../bridge/mock'
import { ToastProvider } from '../../components/Toast'
import { previewTemplate } from '../../core/resolveOutputPath'
import type { Settings } from '../../core/types'
import i18n from '../../i18n'
import { useDeps } from '../../stores/deps'
import { startSettingsEffects, useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { APP_AUTHOR, APP_NAME, REPO_URL } from '../../app/brand'
import { SettingsScreen } from './index'

vi.mock('../../app/theme', { spy: true })

const DEPS: MockScript['deps'] = {
  ytdlp: { path: '/bin/yt-dlp', version: '2026.10.09' },
  ffmpeg: { path: '/bin/ffmpeg', version: '7.1', source: 'system' },
  deno: { path: '/app/deno', version: '2.1.4', source: 'app' },
}

// The Big Buck Bunny sample the preview is built from.
const BBB = {
  title: 'Big Buck Bunny 60fps 4K',
  id: 'aqz-KE-bpKQ',
  ext: 'mp4',
  channel: 'Blender',
  upload_date: '20141110',
}

let stopEffects: (() => void) | null = null

async function setup(
  over: Partial<MockScript> = {},
  settings: Partial<Settings> = {},
): Promise<{ user: ReturnType<typeof userEvent.setup>; bridge: MockBridge }> {
  const bridge = createMockBridge({
    deps: DEPS,
    platform: 'windows',
    store: { settings: { language: 'pt-BR', ...settings } },
    ...over,
  })
  await useSettings.getState().load(bridge)
  useDeps.setState({ status: null })
  const user = userEvent.setup()
  render(
    <BridgeProvider bridge={bridge}>
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    </BridgeProvider>,
  )
  return { user, bridge }
}

const stored = () => useSettings.getState().settings
const section = (name: string) => screen.getByRole('region', { name })

beforeEach(async () => {
  stopEffects = null
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'settings', sidebarCollapsed: false, settingsSection: null })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  stopEffects?.()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
  vi.mocked(theme.applyTheme).mockClear()
})

describe('layout', () => {
  it('has the six sections of the spec, in order, under the screen title', async () => {
    await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles).toEqual(['Downloads', 'Rede', 'Acesso', 'Aparência', 'Motor', 'Sobre'])
  })
})

describe('downloads: folder', () => {
  it('"Escolher pasta" asks for a folder and saves the result', async () => {
    const { user, bridge } = await setup({ pickedFolder: 'D:\\Meus Videos' })
    await user.click(within(section('Downloads')).getByRole('button', { name: 'Escolher pasta' }))
    expect(bridge.calls.some((c) => c.method === 'os.pickFolder')).toBe(true)
    expect(stored().outputDir).toBe('D:\\Meus Videos')
    expect(within(section('Downloads')).getByText('D:\\Meus Videos')).toBeInTheDocument()
  })

  it('keeps the folder when the dialog is cancelled', async () => {
    const { user } = await setup({ pickedFolder: null }, { outputDir: 'C:\\Atual' })
    await user.click(screen.getByRole('button', { name: 'Escolher pasta' }))
    expect(stored().outputDir).toBe('C:\\Atual')
  })
})

describe('downloads: name template', () => {
  const preview = () => screen.getByRole('status', { name: 'Prévia do nome' })
  const field = () => screen.getByRole('textbox', { name: 'Modelo personalizado' })

  it('shows a live preview built from the Big Buck Bunny sample', async () => {
    await setup()
    expect(preview()).toHaveTextContent(previewTemplate(stored().outputTemplate, BBB))
    expect(preview()).toHaveTextContent('Big Buck Bunny 60fps 4K [aqz-KE-bpKQ].mp4')
  })

  it('picking an example saves it and updates the preview', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Canal e título' }))
    expect(stored().outputTemplate).toBe('%(channel)s - %(title)s.%(ext)s')
    expect(preview()).toHaveTextContent(previewTemplate('%(channel)s - %(title)s.%(ext)s', BBB))
    expect(preview()).toHaveTextContent('Blender - Big Buck Bunny 60fps 4K.mp4')
    expect(field()).toHaveValue('%(channel)s - %(title)s.%(ext)s')
    expect(screen.getByRole('button', { name: 'Canal e título' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('typing a free template previews it as you type', async () => {
    const { user } = await setup()
    await user.clear(field())
    await user.type(field(), '%(upload_date)s %(title)s.%(ext)s')
    expect(preview()).toHaveTextContent('20141110 Big Buck Bunny 60fps 4K.mp4')
    expect(stored().outputTemplate).toBe('%(upload_date)s %(title)s.%(ext)s')
  })

  it('an empty template is an error and is not saved', async () => {
    const { user } = await setup()
    const before = stored().outputTemplate
    await user.clear(field())
    expect(screen.getByRole('alert')).toHaveTextContent('Digite um modelo')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(stored().outputTemplate).toBe(before)
  })
})

describe('downloads: concurrency and defaults', () => {
  it('saves the number of simultaneous downloads', async () => {
    const { user } = await setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Downloads simultâneos' }), '4')
    expect(stored().concurrency).toBe(4)
  })

  it('saves the default mode, quality and container', async () => {
    const { user } = await setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Qualidade padrão' }), '720')
    expect(stored().defaults.video?.maxHeight).toBe(720)
    await user.click(screen.getByRole('radio', { name: 'MKV' }))
    expect(stored().defaults.video).toEqual({ maxHeight: 720, container: 'mkv' })
    await user.click(screen.getByRole('radio', { name: 'Só áudio' }))
    expect(stored().defaults.mode).toBe('audio')
    await user.click(screen.getByRole('radio', { name: 'FLAC' }))
    expect(stored().defaults.audio?.format).toBe('flac')
    // the video choice survives a visit to audio
    expect(stored().defaults.video).toEqual({ maxHeight: 720, container: 'mkv' })
  })
})

describe('network: rate limit', () => {
  const box = () => screen.getByRole('textbox', { name: 'Limite de velocidade' })

  it.each(['500K', '2M', '1.5M', '2g'])('accepts %s and saves it', async (value) => {
    const { user } = await setup()
    await user.type(box(), value)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(stored().rateLimit).toBe(value)
  })

  it('an empty field means no limit', async () => {
    const { user } = await setup({}, { rateLimit: '2M' })
    expect(box()).toHaveValue('2M')
    await user.clear(box())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(stored().rateLimit).toBeNull()
  })

  it.each(['abc', 'X5', '-2M', '0', '5', '0M', '1.5'])(
    'rejects %s with an inline error and does not save it',
    async (value) => {
      const { user } = await setup({}, { rateLimit: '1M' })
      await user.clear(box())
      await user.type(box(), value)
      expect(within(section('Rede')).getByRole('alert')).toHaveTextContent(/500K ou 2M/)
      expect(box()).toHaveAttribute('aria-invalid', 'true')
      // the last valid value (the cleared field) was the last one saved: the bad text never is
      expect(stored().rateLimit).not.toBe(value)
      expect(stored().rateLimit).toBeNull()
    },
  )
})

describe('network: proxy', () => {
  const box = () => screen.getByRole('textbox', { name: 'Proxy' })

  it.each(['http://127.0.0.1:8080', 'https://proxy.local:443', 'socks5://127.0.0.1:1080'])(
    'accepts %s',
    async (value) => {
      const { user } = await setup()
      await user.type(box(), value)
      expect(screen.queryByRole('alert')).toBeNull()
      expect(stored().proxy).toBe(value)
    },
  )

  it('also accepts socks5h://', async () => {
    const { user } = await setup()
    await user.type(box(), 'socks5h://localhost:9050')
    expect(stored().proxy).toBe('socks5h://localhost:9050')
  })

  it.each(['127.0.0.1:8080', 'ftp://x.test', 'http:/x', 'socks5:'])(
    'rejects %s and does not save it',
    async (value) => {
      const { user } = await setup()
      await user.type(box(), value)
      expect(within(section('Rede')).getByRole('alert')).toHaveTextContent(/socks5:\/\//)
      expect(stored().proxy).toBeNull()
    },
  )

  it('an empty field removes the proxy', async () => {
    const { user } = await setup({}, { proxy: 'http://a.test:1' })
    await user.clear(box())
    expect(stored().proxy).toBeNull()
  })
})

describe('network: retries', () => {
  const box = () => screen.getByRole('textbox', { name: 'Tentativas' })

  it('saves a whole number', async () => {
    const { user } = await setup()
    await user.clear(box())
    await user.type(box(), '5')
    expect(stored().retries).toBe(5)
  })

  it('rejects text and values out of range', async () => {
    const { user } = await setup({}, { retries: 3 })
    await user.clear(box())
    await user.type(box(), 'x')
    expect(within(section('Rede')).getByRole('alert')).toBeInTheDocument()
    expect(stored().retries).toBe(3)
    await user.clear(box())
    await user.type(box(), '101')
    expect(within(section('Rede')).getByRole('alert')).toBeInTheDocument()
    // '1' and '10' were fine on the way; the out-of-range '101' never is
    expect(stored().retries).toBe(10)
  })
})

describe('access: cookies', () => {
  const select = () => screen.getByRole('combobox', { name: 'Cookies do navegador' })

  it('saves the chosen browser', async () => {
    const { user } = await setup()
    await user.selectOptions(select(), 'firefox')
    expect(stored().cookiesBrowser).toBe('firefox')
  })

  it('recommends Firefox when Chrome is chosen on Windows', async () => {
    const { user } = await setup({ platform: 'windows' })
    expect(screen.queryByRole('note')).toBeNull()
    await user.selectOptions(select(), 'chrome')
    expect(within(section('Acesso')).getByRole('note')).toHaveTextContent(/Firefox/)
    expect(within(section('Acesso')).getByRole('note')).toHaveTextContent(/Chrome/)
  })

  it('has no Chrome warning on other systems', async () => {
    const { user } = await setup({ platform: 'linux' })
    await user.selectOptions(select(), 'chrome')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('offers Safari only on macOS', async () => {
    await setup({ platform: 'windows' })
    expect(within(select()).queryByRole('option', { name: 'Safari' })).toBeNull()
  })
})

describe('appearance', () => {
  it('changing the theme applies it right away', async () => {
    const { user } = await setup()
    stopEffects = startSettingsEffects(useSettings)
    await user.click(screen.getByRole('radio', { name: 'Escuro' }))
    expect(stored().theme).toBe('dark')
    expect(theme.applyTheme).toHaveBeenLastCalledWith('dark', expect.any(Boolean))
    await user.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(theme.applyTheme).toHaveBeenLastCalledWith('light', expect.any(Boolean))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('changing the language changes the text of the screen itself', async () => {
    const { user } = await setup()
    stopEffects = startSettingsEffects(useSettings)
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'English' }))
    expect(stored().language).toBe('en')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Network' })).toBeInTheDocument()
  })
})

describe('engine', () => {
  it('shows the versions and where ffmpeg and Deno come from', async () => {
    await setup()
    const engine = section('Motor')
    expect(await within(engine).findByText('2026.10.09')).toBeInTheDocument()
    expect(within(engine).getByText('7.1')).toBeInTheDocument()
    expect(within(engine).getByText('do sistema')).toBeInTheDocument()
    expect(within(engine).getByText('2.1.4')).toBeInTheDocument()
    expect(within(engine).getByText('do app')).toBeInTheDocument()
  })

  it('"Atualizar agora" updates on the chosen channel and shows the new version', async () => {
    const { user, bridge } = await setup({ updateVersion: '2026.11.02' })
    const engine = section('Motor')
    await within(engine).findByText('2026.10.09')
    await user.click(within(engine).getByRole('radio', { name: 'Nightly' }))
    expect(stored().channel).toBe('nightly')
    await user.click(within(engine).getByRole('button', { name: 'Atualizar agora' }))
    expect(await within(engine).findByText('yt-dlp atualizado para 2026.11.02')).toBeInTheDocument()
    expect(bridge.calls.find((c) => c.method === 'deps.update')?.args).toEqual(['nightly'])
    // the version row follows (and so does anything else reading the shared status)
    await waitFor(() => expect(within(engine).getByText('2026.11.02')).toBeInTheDocument())
    expect(useDeps.getState().status?.ytdlp?.version).toBe('2026.11.02')
  })

  it('says so when the version did not change', async () => {
    const { user } = await setup({ updateVersion: '2026.10.09' })
    const engine = section('Motor')
    await within(engine).findByText('2026.10.09')
    await user.click(within(engine).getByRole('button', { name: 'Atualizar agora' }))
    expect(await within(engine).findByText('Já está na versão mais recente')).toBeInTheDocument()
  })

  it('shows a failed update as an error and lets you try again', async () => {
    const { user, bridge } = await setup()
    const engine = section('Motor')
    await within(engine).findByText('2026.10.09')
    bridge.deps.update = () => Promise.reject(new Error('sem rede'))
    await user.click(within(engine).getByRole('button', { name: 'Atualizar agora' }))
    expect(await within(engine).findByRole('alert')).toHaveTextContent('sem rede')
    expect(within(engine).getByRole('button', { name: 'Atualizar agora' })).toBeEnabled()
  })

  it('offers to install a missing tool and refreshes afterwards', async () => {
    const { user, bridge } = await setup({
      deps: { ytdlp: DEPS.ytdlp, ffmpeg: null, deno: null },
    })
    const engine = section('Motor')
    await user.click(await within(engine).findByRole('button', { name: 'Instalar ffmpeg' }))
    expect(bridge.calls.find((c) => c.method === 'deps.install')?.args).toEqual(['ffmpeg'])
    await waitFor(() => expect(within(engine).getByText('mock-ffmpeg')).toBeInTheDocument())
    expect(within(engine).queryByRole('button', { name: 'Instalar ffmpeg' })).toBeNull()
    expect(within(engine).getByRole('button', { name: 'Instalar Deno' })).toBeInTheDocument()
  })
})

describe('about', () => {
  it('shows the name, the repository link, the license and the credits', async () => {
    const { user, bridge } = await setup()
    const about = section('Sobre')
    expect(within(about).getByText(APP_NAME)).toBeInTheDocument()
    expect(within(about).getByText('Licença MIT')).toBeInTheDocument()
    expect(within(about).getByText(`Criado por ${APP_AUTHOR}`)).toBeInTheDocument()
    const credits = within(about).getByRole('list', { name: 'Créditos' })
    expect(credits).toHaveTextContent('yt-dlp (Unlicense)')
    expect(credits).toHaveTextContent('ffmpeg (LGPL/GPL)')
    expect(credits).toHaveTextContent('Deno (MIT)')
    const link = within(about).getByRole('link', { name: /Repositório/ })
    expect(link).toHaveAttribute('href', REPO_URL)
    await user.click(link)
    expect(bridge.calls.find((c) => c.method === 'os.openUrl')?.args).toEqual([REPO_URL])
  })
})

describe('arriving from an error action', () => {
  it.each([
    ['access', 'Acesso'],
    ['network', 'Rede'],
  ] as const)(
    'go(settings, { section: %s }) scrolls to and focuses that section',
    async (id, name) => {
      useUi.getState().go('settings', { section: id })
      await setup()
      const heading = within(section(name)).getByRole('heading', { level: 2, name })
      expect(document.activeElement).toBe(heading)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      // consumed, so coming back to Settings later starts at the top
      expect(useUi.getState().settingsSection).toBeNull()
    },
  )

  it('without a section nothing is focused or scrolled', async () => {
    useUi.getState().go('settings')
    await setup()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('go() to another screen drops a leftover section', () => {
    useUi.getState().go('settings', { section: 'network' })
    useUi.getState().go('queue')
    expect(useUi.getState().settingsSection).toBeNull()
  })
})
