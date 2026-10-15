import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeProvider } from '../../bridge/context'
import { createMockBridge } from '../../bridge/mock'
import { ToastProvider } from '../../components/Toast'
import type { PlaylistEntry, PlaylistInfo } from '../../core/types'
import i18n from '../../i18n'
import { useHistory } from '../../stores/history'
import { useQueue, type QueueInput } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { PlaylistView } from './PlaylistView'
import { ProbeProvider } from './ProbeProvider'

const ROW_HEIGHT = 96
const VIEWPORT_HEIGHT = 600

// jsdom does no layout: every element measures 0 x 0, so a virtualised list would show no rows at
// all. Giving elements a size is all the virtualiser needs (it reads `offsetHeight` of the scroll
// element); it then positions rows by arithmetic, which is what these tests exercise.
const realHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const realWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => VIEWPORT_HEIGHT,
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 800,
  })
})
afterAll(() => {
  if (realHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realHeight)
  if (realWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', realWidth)
})

const GB = 1024 ** 3

function entries(n: number, over: (k: number) => Partial<PlaylistEntry> = () => ({})) {
  return Array.from({ length: n }, (_, i): PlaylistEntry => {
    const k = i + 1
    return {
      id: `vid${k}`,
      url: `https://www.youtube.com/watch?v=vid${k}`,
      title: `Aula ${k}`,
      duration: 600 + k,
      thumbnail: `https://i.ytimg.com/vi/vid${k}/hq.jpg`,
      available: true,
      ...over(k),
    }
  })
}

function playlistOf(list: PlaylistEntry[]): PlaylistInfo {
  return {
    id: 'PL1',
    extractor: 'youtube:tab',
    title: 'Curso de React',
    channel: 'Net Ninja',
    entries: list,
  }
}

const history = (videoId: string, extractor = 'youtube') => ({
  id: `h-${videoId}`,
  extractor,
  videoId,
  title: videoId,
  thumbnail: null,
  path: '',
  sizeBytes: null,
  finishedAt: 1,
})

async function setup(list: PlaylistEntry[], { stubQueue = true } = {}) {
  const bridge = createMockBridge({})
  await useSettings.getState().load(bridge)
  await useQueue.getState().load(bridge)
  const enqueue = vi.fn<(inputs: QueueInput[]) => void>()
  if (stubQueue) useQueue.setState({ enqueue })
  const user = userEvent.setup()
  render(
    <BridgeProvider bridge={bridge}>
      <ToastProvider>
        <ProbeProvider>
          <PlaylistView playlist={playlistOf(list)} />
        </ProbeProvider>
      </ToastProvider>
    </BridgeProvider>,
  )
  return { user, enqueue, bridge }
}

const summary = () => screen.getByTestId('selection-summary')
const grid = () => screen.getByRole('grid', { name: 'Itens da playlist' })
const rows = () => within(grid()).queryAllByRole('row')
const checkboxOf = (title: string) => screen.getByRole('checkbox', { name: `Selecionar ${title}` })

const realEnqueue = useQueue.getState().enqueue

beforeEach(async () => {
  useQueue.setState({ enqueue: realEnqueue })
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'download', sidebarCollapsed: false })
  useHistory.setState({ items: [] })
  useQueue.setState({ jobs: [], activeCount: 0, terminating: [] })
})

describe('header', () => {
  it('shows the name, author, count and total duration', async () => {
    await setup(entries(3, () => ({ duration: 3600 })))
    const head = screen.getByRole('region', { name: 'Curso de React' })
    expect(within(head).getByRole('heading', { name: 'Curso de React' })).toBeInTheDocument()
    expect(within(head).getByText('Net Ninja')).toBeInTheDocument()
    expect(within(head).getByText('3 itens')).toBeInTheDocument()
    expect(within(head).getByText('3 h')).toBeInTheDocument()
  })

  it('shows "18 selecionados · ~3,4 GB" when the sizes are known', async () => {
    await setup(entries(18, () => ({ sizeBytes: (3.4 * GB) / 18 })))
    expect(summary()).toHaveTextContent('18 selecionados · ~3,4 GB')
  })

  it('leaves the size out when it is not known', async () => {
    await setup(entries(18))
    expect(summary()).toHaveTextContent(/^18 selecionados$/)
  })

  it('leaves the size out when only some of the selected items have one', async () => {
    await setup(entries(4, (k) => (k <= 2 ? { sizeBytes: GB } : {})))
    expect(summary()).toHaveTextContent(/^4 selecionados$/)
  })

  it('says "1 selecionado" for one item', async () => {
    await setup(entries(1))
    expect(summary()).toHaveTextContent(/^1 selecionado$/)
  })

  it('in English: "2 selected"', async () => {
    await act(() => i18n.changeLanguage('en'))
    await setup(entries(2))
    expect(summary()).toHaveTextContent(/^2 selected$/)
  })
})

describe('initial selection and shortcuts', () => {
  it('starts with everything ticked except what the history knows and what is unavailable', async () => {
    useHistory.setState({ items: [history('vid2')] })
    await setup(
      entries(4, (k) => (k === 3 ? { available: false, title: null } : k === 4 ? { url: '' } : {})),
    )
    expect(summary()).toHaveTextContent(/^1 selecionado$/)
    expect(checkboxOf('Aula 1')).toBeChecked()
    expect(checkboxOf('Aula 2')).not.toBeChecked()
  })

  it('dims a downloaded row and marks it with the check icon; an unavailable one is disabled', async () => {
    useHistory.setState({ items: [history('vid2')] })
    await setup(entries(3, (k) => (k === 3 ? { url: '' } : {})))
    const [r1, r2, r3] = rows()
    expect(within(r1).queryByTestId('downloaded-icon')).not.toBeInTheDocument()
    expect(within(r2).getByTestId('downloaded-icon')).toBeInTheDocument()
    expect(r2).toHaveAttribute('data-dim', 'true')
    expect(r1).not.toHaveAttribute('data-dim', 'true')
    expect(within(r3).getByRole('checkbox')).toBeDisabled()
    expect(within(r3).getByText('Vídeo indisponível')).toBeInTheDocument()
  })

  it('shows "Vídeo indisponível" for a missing title, a placeholder title and an empty link', async () => {
    await setup(
      entries(4, (k) =>
        k === 1
          ? { title: null, available: false }
          : k === 2
            ? { title: '[Private video]', available: false }
            : k === 3
              ? { url: '' }
              : {},
      ),
    )
    const [r1, r2, r3, r4] = rows()
    for (const row of [r1, r2, r3]) {
      expect(within(row).getByText('Vídeo indisponível')).toBeInTheDocument()
      expect(within(row).getByRole('checkbox')).toBeDisabled()
      expect(within(row).getByRole('checkbox')).not.toBeChecked()
    }
    expect(screen.queryByText('[Private video]')).not.toBeInTheDocument()
    expect(within(r4).getByText('Aula 4')).toBeInTheDocument()
    expect(summary()).toHaveTextContent(/^1 selecionado$/)
  })

  it('says "Video unavailable" in English', async () => {
    await act(() => i18n.changeLanguage('en'))
    await setup(entries(1, () => ({ title: null, available: false })))
    expect(within(screen.getAllByRole('row')[0]).getByText('Video unavailable')).toBeInTheDocument()
  })

  it('"Nenhum" clears the selection', async () => {
    const { user } = await setup(entries(5))
    await user.click(screen.getByRole('button', { name: 'Nenhum' }))
    expect(summary()).toHaveTextContent(/^0 selecionado$/)
    expect(checkboxOf('Aula 1')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Baixar 0' })).toBeDisabled()
  })

  it('"Todos" ticks every item that can be downloaded, the downloaded ones too', async () => {
    useHistory.setState({ items: [history('vid2')] })
    const { user } = await setup(entries(4, (k) => (k === 4 ? { available: false } : {})))
    expect(summary()).toHaveTextContent(/^2 selecionados$/)
    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(summary()).toHaveTextContent(/^3 selecionados$/)
    expect(checkboxOf('Aula 2')).toBeChecked()
  })

  it('"Não baixados" selects only what is not in the history', async () => {
    useHistory.setState({ items: [history('vid2'), history('vid3')] })
    const { user } = await setup(entries(5))
    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(summary()).toHaveTextContent(/^5 selecionados$/)
    await user.click(screen.getByRole('button', { name: 'Não baixados' }))
    expect(summary()).toHaveTextContent(/^3 selecionados$/)
    expect(checkboxOf('Aula 1')).toBeChecked()
    expect(checkboxOf('Aula 2')).not.toBeChecked()
    expect(checkboxOf('Aula 3')).not.toBeChecked()
  })

  it('lights only the shortcut chip that matches the selection', async () => {
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'
    // nothing downloaded yet: "Todos" and "Não baixados" are the same set, only "Todos" shows
    const { user } = await setup(entries(3))
    expect(pressed('Todos')).toBe(true)
    expect(pressed('Não baixados')).toBe(false)
    expect(pressed('Nenhum')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Nenhum' }))
    expect(pressed('Nenhum')).toBe(true)
    expect(pressed('Todos')).toBe(false)
  })

  it('lights "Não baixados" when it differs from everything', async () => {
    useHistory.setState({ items: [history('vid2')] })
    const { user } = await setup(entries(3))
    // the initial selection already is the not-downloaded set
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'
    expect(pressed('Não baixados')).toBe(true)
    expect(pressed('Todos')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(pressed('Todos')).toBe(true)
    expect(pressed('Não baixados')).toBe(false)
  })

  it('does not count a download from another site as the same video', async () => {
    useHistory.setState({ items: [history('vid1', 'vimeo')] })
    await setup(entries(2))
    expect(summary()).toHaveTextContent(/^2 selecionados$/)
  })

  it('ticks and unticks with the checkbox, with the keyboard, and by clicking the row', async () => {
    const { user } = await setup(entries(3))
    const box = checkboxOf('Aula 2')
    await user.click(box)
    expect(box).not.toBeChecked()
    box.focus()
    await user.keyboard(' ')
    expect(box).toBeChecked()
    await user.click(screen.getByText('Aula 2'))
    expect(box).not.toBeChecked()
    expect(summary()).toHaveTextContent(/^2 selecionados$/)
  })
})

describe('range', () => {
  it('"Intervalo…" selects exactly the typed range', async () => {
    const { user } = await setup(entries(12))
    await user.click(screen.getByRole('button', { name: 'Intervalo…' }))
    await user.type(screen.getByRole('textbox', { name: 'Intervalo' }), '1-3, 7, 10-{Enter}')
    expect(summary()).toHaveTextContent(/^7 selecionados$/)
    expect(checkboxOf('Aula 1')).toBeChecked()
    expect(checkboxOf('Aula 4')).not.toBeChecked()
    // The popover closes once the range is applied.
    expect(screen.queryByRole('textbox', { name: 'Intervalo' })).not.toBeInTheDocument()
  })

  it('shows an inline error for a bad range and keeps the selection', async () => {
    const { user } = await setup(entries(5))
    await user.click(screen.getByRole('button', { name: 'Intervalo…' }))
    const input = screen.getByRole('textbox', { name: 'Intervalo' })
    await user.type(input, '0{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Use números a partir de 1')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(summary()).toHaveTextContent(/^5 selecionados$/)
    await user.clear(input)
    await user.type(input, '9{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('A playlist tem só 5 itens')
  })

  it('never ticks an item that cannot be downloaded', async () => {
    const { user } = await setup(entries(4, (k) => (k === 2 ? { url: '' } : {})))
    await user.click(screen.getByRole('button', { name: 'Nenhum' }))
    await user.click(screen.getByRole('button', { name: 'Intervalo…' }))
    await user.type(screen.getByRole('textbox', { name: 'Intervalo' }), '1-4{Enter}')
    expect(summary()).toHaveTextContent(/^3 selecionados$/)
  })
})

describe('download', () => {
  it('"Baixar 18" enqueues 18 jobs, each with the url of its item', async () => {
    const list = entries(18)
    const { user } = await setup(list, { stubQueue: false })
    await user.click(screen.getByRole('button', { name: 'Baixar 18' }))
    const jobs = useQueue.getState().jobs
    expect(jobs).toHaveLength(18)
    expect(jobs.map((j) => j.url)).toEqual(list.map((e) => e.url))
    expect(useUi.getState().screen).toBe('queue')
  })

  it('hands the queue the title, thumbnail and the id the history matches on', async () => {
    const { user, enqueue } = await setup(entries(2))
    await user.click(screen.getByRole('button', { name: 'Baixar 2' }))
    expect(enqueue).toHaveBeenCalledTimes(1)
    const inputs = enqueue.mock.calls[0][0]
    expect(inputs[1]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=vid2',
      title: 'Aula 2',
      thumbnail: 'https://i.ytimg.com/vi/vid2/hq.jpg',
      extractor: 'youtube',
      videoId: 'vid2',
    })
    expect(inputs[0].opts.mode).toBe('video')
  })

  it('enqueues only the selected items, in playlist order, and never an empty url', async () => {
    const { user, enqueue } = await setup(entries(5, (k) => (k === 3 ? { url: '' } : {})))
    await user.click(screen.getByRole('button', { name: 'Todos' }))
    await user.click(checkboxOf('Aula 1'))
    await user.click(screen.getByRole('button', { name: 'Baixar 3' }))
    const urls = enqueue.mock.calls[0][0].map((i) => i.url)
    expect(urls).toEqual([
      'https://www.youtube.com/watch?v=vid2',
      'https://www.youtube.com/watch?v=vid4',
      'https://www.youtube.com/watch?v=vid5',
    ])
    expect(urls).not.toContain('')
  })

  it('goes to the queue and says so', async () => {
    const { user } = await setup(entries(2))
    await user.click(screen.getByRole('button', { name: 'Baixar 2' }))
    expect(useUi.getState().screen).toBe('queue')
    expect(await screen.findByText('Adicionado à fila')).toBeInTheDocument()
  })

  it('"Opções" opens the compact panel and its choices apply to every selected item', async () => {
    const { user, enqueue } = await setup(entries(3))
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    const panel = screen.getByRole('region', { name: 'Opções de download' })
    // No per-item formats for a list.
    expect(within(panel).queryByRole('button', { name: 'Avançado' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Só áudio' }))
    await user.click(within(panel).getByRole('button', { name: 'Baixar' }))
    const inputs = enqueue.mock.calls[0][0]
    expect(inputs).toHaveLength(3)
    expect(inputs.every((i) => i.opts.mode === 'audio')).toBe(true)
  })

  it('keeps the options chosen in the popover after it closes; "Baixar N" uses them', async () => {
    const { user, enqueue } = await setup(entries(3))
    expect(screen.queryByTestId('options-summary')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    let panel = screen.getByRole('region', { name: 'Opções de download' })
    await user.click(within(panel).getByRole('button', { name: 'Só áudio' }))
    await user.click(within(panel).getByRole('button', { name: 'FLAC' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Opções de download' })).not.toBeInTheDocument()
    expect(screen.getByTestId('options-summary')).toHaveTextContent('Só áudio · FLAC')
    // reopening shows the same choices, not the defaults
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    panel = screen.getByRole('region', { name: 'Opções de download' })
    expect(within(panel).getByRole('button', { name: 'FLAC' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Baixar 3' }))
    const inputs = enqueue.mock.calls[0][0]
    expect(inputs).toHaveLength(3)
    expect(inputs.every((i) => i.opts.mode === 'audio' && i.opts.audio?.format === 'flac')).toBe(
      true,
    )
  })

  it('offers the standard heights, without sizes, in the options', async () => {
    const { user } = await setup(entries(3))
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    const panel = screen.getByRole('region', { name: 'Opções de download' })
    for (const name of ['4K', '1440p', '1080p', '720p', '480p', 'Melhor']) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('has nothing to download with nothing selected', async () => {
    const { user } = await setup(entries(2))
    await user.click(screen.getByRole('button', { name: 'Nenhum' }))
    expect(screen.getByRole('button', { name: 'Opções' })).toBeDisabled()
  })
})

describe('Review Focus 4: a long playlist is virtualised', () => {
  it('renders fewer than 60 rows for 5000 entries and reaches item 5000 by scrolling', async () => {
    await setup(entries(5000))
    expect(grid()).toHaveAttribute('aria-rowcount', '5000')
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().length).toBeLessThan(60)
    expect(screen.queryByText('Aula 5000')).not.toBeInTheDocument()

    const scroller = screen.getByTestId('playlist-scroll')
    scroller.scrollTop = 5000 * ROW_HEIGHT
    fireEvent.scroll(scroller)

    expect(await screen.findByText('Aula 5000')).toBeInTheDocument()
    expect(rows().length).toBeLessThan(60)
    expect(screen.queryByText('Aula 1')).not.toBeInTheDocument()
    expect(summary()).toHaveTextContent(/^5000 selecionados$/)
  })
})
