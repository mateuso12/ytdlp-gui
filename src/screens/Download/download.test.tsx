import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockBridge, type MockBridge, type ProbeResponse } from '../../bridge/mock'
import type { DepsStatus, ProbeResult } from '../../bridge/types'
import playlistFlat from '../../core/__fixtures__/playlist-flat.json?raw'
import unsupportedStderr from '../../core/__fixtures__/stderr-unsupported.txt?raw'
import video from '../../core/__fixtures__/video.json?raw'
import { parseProbe } from '../../core/parseProbe'
import i18n from '../../i18n'
import { useQueue } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { renderApp } from '../../test/renderApp'

const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'
const LIST_ID = 'PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv'
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${LIST_ID}`
const AMBIGUOUS_URL = `${VIDEO_URL}&list=${LIST_ID}`
const UNSUPPORTED_URL = 'https://example.com/'
const VIDEO_TITLE = 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film'
const SUGGESTION = 'Colar link da área de transferência'

const DEPS: DepsStatus = {
  ytdlp: { path: '/bin/yt-dlp', version: '1' },
  ffmpeg: { path: '/bin/ffmpeg', version: '1', source: 'app' },
  deno: { path: '/bin/deno', version: '1', source: 'app' },
}

const ok = (stdout: string): ProbeResult => ({ code: 0, stdout, stderr: '' })
const isFlat = (args: string[]) => args.includes('--flat-playlist')
const urlOf = (args: string[]) => args[args.length - 1]

/** Answers like yt-dlp would for the fixture URLs. */
function router(args: string[]): ProbeResult {
  const url = urlOf(args)
  if (url === UNSUPPORTED_URL) return { code: 1, stdout: '', stderr: unsupportedStderr }
  if (isFlat(args) && url.includes('list=')) return ok(playlistFlat)
  return ok(video)
}

const probeCalls = (b: MockBridge) =>
  b.calls.filter((c) => c.method === 'probe').map((c) => c.args[0] as string[])

const playlistCount = () => {
  const probe = parseProbe(JSON.parse(playlistFlat), PLAYLIST_URL)
  if (probe.kind !== 'playlist') throw new Error('fixture is not a playlist')
  return probe.playlist.entries.length
}

type User = ReturnType<typeof userEvent.setup>

async function setup(clipboard = '', fallbackProbe: ProbeResponse = router) {
  const bridge = createMockBridge({ deps: DEPS, fallbackProbe, clipboard })
  await useSettings.getState().load(bridge)
  await useQueue.getState().load(bridge)
  const user = userEvent.setup()
  renderApp(bridge)
  const field = screen.getByRole('textbox', { name: 'Link do vídeo ou da playlist' })
  return { bridge, user, field }
}

async function pasteUrl(user: User, field: HTMLElement, text: string) {
  await user.click(field)
  await user.paste(text)
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'download', sidebarCollapsed: false })
  useQueue.setState({ jobs: [], activeCount: 0, terminating: [] })
})

describe('link field', () => {
  it('has the id the paste shortcut expects and starts focused', async () => {
    const { field } = await setup()
    expect(field).toHaveAttribute('id', 'url-field')
    expect(field).toHaveFocus()
  })

  it('shows the check icon only once the link was recognised', async () => {
    const { user, field } = await setup()
    expect(screen.queryByTestId('url-ok')).not.toBeInTheDocument()
    await pasteUrl(user, field, VIDEO_URL)
    await screen.findByRole('heading', { name: VIDEO_TITLE })
    expect(screen.getByTestId('url-ok')).toBeInTheDocument()
  })

  it('goes back to idle when the field is emptied', async () => {
    const { user, field } = await setup()
    await pasteUrl(user, field, VIDEO_URL)
    await screen.findByRole('heading', { name: VIDEO_TITLE })
    await user.clear(field)
    expect(screen.queryByRole('heading', { name: VIDEO_TITLE })).not.toBeInTheDocument()
    expect(screen.getByText('Cole um link no campo acima para começar.')).toBeInTheDocument()
  })

  it('analyses a link typed and confirmed with Enter', async () => {
    const { user, field } = await setup()
    await user.type(field, `${VIDEO_URL}{Enter}`)
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
  })

  it('"Colar" reads the clipboard and analyses it', async () => {
    const { user, bridge } = await setup(VIDEO_URL)
    await user.click(screen.getByRole('button', { name: 'Colar' }))
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(bridge.calls.some((c) => c.method === 'os.readClipboard')).toBe(true)
  })

  it('treats a clipboard read that rejects as empty', async () => {
    const { user, bridge, field } = await setup()
    bridge.os.readClipboard = () => Promise.reject(new Error('clipboard has an image'))
    await user.click(screen.getByRole('button', { name: 'Colar' }))
    expect(field).toHaveValue('')
    expect(probeCalls(bridge)).toHaveLength(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('detection', () => {
  it('video: shows the title and the selected "Vídeo" chip, probing with --no-playlist', async () => {
    const { user, bridge, field } = await setup()
    await pasteUrl(user, field, VIDEO_URL)
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vídeo', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Vídeo único')).toBeInTheDocument()
    // A YouTube watch URL is certainly one video: no flat probe first.
    const calls = probeCalls(bridge)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('--no-playlist')
    expect(calls[0]).not.toContain('--flat-playlist')
  })

  it('unknown host: flat probe first, then the full probe when it is a video', async () => {
    const { user, bridge, field } = await setup()
    await pasteUrl(user, field, 'https://vimeo.com/123456')
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    const calls = probeCalls(bridge)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('--flat-playlist')
    expect(calls[1]).toContain('--no-playlist')
    expect(calls[1]).not.toContain('--flat-playlist')
  })

  it('uses the installed deno for the probe', async () => {
    const { user, bridge, field } = await setup()
    await pasteUrl(user, field, VIDEO_URL)
    await screen.findByRole('heading', { name: VIDEO_TITLE })
    expect(probeCalls(bridge)[0]).toEqual(
      expect.arrayContaining(['--js-runtimes', 'deno:/bin/deno']),
    )
  })

  it('playlist: shows the name and the number of items', async () => {
    const { user, field } = await setup()
    await pasteUrl(user, field, PLAYLIST_URL)
    expect(await screen.findByRole('heading', { name: 'Settlers' })).toBeInTheDocument()
    expect(screen.getByText(`${playlistCount()} itens`)).toBeInTheDocument()
  })

  it('ambiguous: shows the bar, and "Só este vídeo" runs the full probe with --no-playlist', async () => {
    const { user, bridge, field } = await setup()
    await pasteUrl(user, field, AMBIGUOUS_URL)
    const n = playlistCount()
    expect(await screen.findByText(`Playlist inteira · ${n}`)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: `Playlist inteira · ${n}` })).toBeChecked()
    // Only the flat probe so far: it counted the playlist items.
    expect(probeCalls(bridge)).toHaveLength(1)
    expect(probeCalls(bridge)[0]).toContain('--flat-playlist')

    await user.click(screen.getByText('Só este vídeo'))
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    const calls = probeCalls(bridge)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('--no-playlist')
    expect(urlOf(calls[1])).toBe(AMBIGUOUS_URL)
    expect(screen.getByRole('radio', { name: 'Só este vídeo' })).toBeChecked()

    // Going back to the playlist reuses what the flat probe already found.
    await user.click(screen.getByText(`Playlist inteira · ${n}`))
    expect(await screen.findByRole('heading', { name: 'Settlers' })).toBeInTheDocument()
    expect(probeCalls(bridge)).toHaveLength(2)
  })

  it('multiple links: shows "3 links" and queues 3 jobs with the default options', async () => {
    const { user, bridge, field } = await setup()
    const urls = [VIDEO_URL, 'https://youtu.be/BIRCCQHz-B8', 'https://vimeo.com/123456']
    await pasteUrl(user, field, urls.join('\n'))
    expect(await screen.findByText('3 links')).toBeInTheDocument()
    expect(probeCalls(bridge)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Adicionar 3 à fila' }))
    await waitFor(() => {
      expect(useQueue.getState().jobs.every((j) => j.args.length > 0)).toBe(true)
    })
    const jobs = useQueue.getState().jobs
    expect(jobs.map((j) => j.url)).toEqual(urls)
    const height = useSettings.getState().settings.defaults.video?.maxHeight
    for (const job of jobs) {
      // The URL stands in for the title until a probe is done.
      expect(job.title).toBe(job.url)
      expect(job.args).toContain(`bv*[height<=?${String(height)}]+ba/b[height<=?${String(height)}]`)
      expect(job.args[job.args.length - 1]).toBe(job.url)
    }
    expect(useUi.getState().screen).toBe('queue')
  })

  it('duplicated links count once', async () => {
    const { user, field } = await setup()
    await pasteUrl(user, field, `${VIDEO_URL}\n${VIDEO_URL}`)
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(screen.queryByText(/links$/)).not.toBeInTheDocument()
  })

  it('a paste on another screen takes you to the Download screen', async () => {
    const { user, field } = await setup()
    await user.click(screen.getByRole('button', { name: 'Histórico' }))
    await user.click(field)
    await user.paste(VIDEO_URL)
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(useUi.getState().screen).toBe('download')
  })
})

describe('feedback', () => {
  it('shows the friendly message below the field when the probe fails', async () => {
    const { user, field } = await setup()
    await pasteUrl(user, field, UNSUPPORTED_URL)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Link não suportado')).toBeInTheDocument()
    expect(within(alert).getByText(/ERROR: Unsupported URL/)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(/Link não suportado/)
  })

  it('text that is not a link is reported without probing', async () => {
    const { user, bridge, field } = await setup()
    await pasteUrl(user, field, 'isso não é um link')
    expect(await screen.findByRole('alert')).toHaveTextContent('Link não suportado')
    expect(probeCalls(bridge)).toHaveLength(0)
  })

  it('announces the analysis while it is running', async () => {
    let release: (r: ProbeResult) => void = () => undefined
    const { user, field } = await setup(
      '',
      () => new Promise<ProbeResult>((resolve) => (release = resolve)),
    )
    await pasteUrl(user, field, VIDEO_URL)
    expect(await screen.findByRole('status')).toHaveTextContent('Analisando o link…')
    await act(async () => release(ok(video)))
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a probe that does not return JSON becomes an error', async () => {
    const { user, field } = await setup('', () => ok('not json'))
    await pasteUrl(user, field, VIDEO_URL)
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado')
  })

  it('a probe that rejects becomes an error', async () => {
    const { user, field } = await setup('', () => Promise.reject(new Error('spawn failed')))
    await pasteUrl(user, field, VIDEO_URL)
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado')
  })

  it('translates the messages when the language changes', async () => {
    const { user, field } = await setup()
    await pasteUrl(user, field, UNSUPPORTED_URL)
    await screen.findByRole('alert')
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported link')
    expect(screen.getByRole('textbox', { name: 'Video or playlist link' })).toBeInTheDocument()
  })
})

describe('races', () => {
  it('a slow probe for an old link never overwrites the newer one', async () => {
    const releases = new Map<string, (r: ProbeResult) => void>()
    const OLD = 'https://www.youtube.com/watch?v=OLDOLDOLDOL'
    const NEW = 'https://www.youtube.com/watch?v=NEWNEWNEWNE'
    const { user, field } = await setup(
      '',
      (args) => new Promise<ProbeResult>((resolve) => releases.set(urlOf(args), resolve)),
    )
    const titled = (title: string) => ok(JSON.stringify({ ...JSON.parse(video), title }))

    await pasteUrl(user, field, OLD)
    await waitFor(() => expect(releases.has(OLD)).toBe(true))
    await user.clear(field)
    await user.paste(NEW)
    await waitFor(() => expect(releases.has(NEW)).toBe(true))

    await act(async () => releases.get(NEW)?.(titled('Newer video')))
    expect(await screen.findByRole('heading', { name: 'Newer video' })).toBeInTheDocument()

    await act(async () => releases.get(OLD)?.(titled('Older video')))
    expect(screen.getByRole('heading', { name: 'Newer video' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Older video' })).not.toBeInTheDocument()
  })

  it('a slow probe is dropped when the field was emptied meanwhile', async () => {
    let release: (r: ProbeResult) => void = () => undefined
    const { user, field } = await setup(
      '',
      () => new Promise<ProbeResult>((resolve) => (release = resolve)),
    )
    await pasteUrl(user, field, VIDEO_URL)
    await screen.findByRole('status')
    await user.clear(field)
    await act(async () => release(ok(video)))
    expect(screen.queryByRole('heading', { name: VIDEO_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('clipboard suggestion', () => {
  const clipboardRead = (b: MockBridge) => b.calls.some((c) => c.method === 'os.readClipboard')

  it('offers a link from the clipboard when the field is empty', async () => {
    const { user, field } = await setup(VIDEO_URL)
    await user.click(await screen.findByRole('button', { name: new RegExp(SUGGESTION) }))
    expect(field).toHaveValue(VIDEO_URL)
    expect(await screen.findByRole('heading', { name: VIDEO_TITLE })).toBeInTheDocument()
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
  })

  it('offers it again when the app regains focus', async () => {
    const { bridge } = await setup()
    // Let the check at start-up finish: nothing in the clipboard yet.
    await waitFor(() => expect(clipboardRead(bridge)).toBe(true))
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
    await bridge.os.writeClipboard(VIDEO_URL)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(await screen.findByText(SUGGESTION)).toBeInTheDocument()
  })

  it('does not offer text that is not a link', async () => {
    const { bridge } = await setup('só texto qualquer')
    await waitFor(() => expect(clipboardRead(bridge)).toBe(true))
    await act(async () => undefined)
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
  })

  it('does not offer anything when reading the clipboard fails', async () => {
    const bridge = createMockBridge({ deps: DEPS, fallbackProbe: router })
    bridge.os.readClipboard = () => Promise.reject(new Error('empty'))
    await useSettings.getState().load(bridge)
    renderApp(bridge)
    await act(async () => undefined)
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
  })

  it('goes away on Escape and when the user types', async () => {
    const { user, field } = await setup(VIDEO_URL)
    await screen.findByText(SUGGESTION)
    await user.keyboard('{Escape}')
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await screen.findByText(SUGGESTION)
    await user.type(field, 'h')
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
  })

  it('is not offered while the field has text', async () => {
    const { user, bridge, field } = await setup()
    await user.type(field, 'abc')
    await bridge.os.writeClipboard(VIDEO_URL)
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await act(async () => undefined)
    expect(screen.queryByText(SUGGESTION)).not.toBeInTheDocument()
  })
})
