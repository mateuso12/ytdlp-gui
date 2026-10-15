import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeProvider } from '../../bridge/context'
import { createMockBridge, type MockBridge } from '../../bridge/mock'
import { ToastProvider } from '../../components/Toast'
import i18n from '../../i18n'
import { useHistory, type HistoryItem } from '../../stores/history'
import { useQueue, type QueueInput } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { defaultDownloadOptions } from '../Download/defaultOptions'
import { HistoryScreen } from './index'

const ROW_HEIGHT = 96
const VIEWPORT_HEIGHT = 600

// jsdom does no layout, so a virtualised list would show no rows. Giving elements a size is all
// the virtualiser needs (same trick as the playlist tests).
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

function item(n: number, over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: `h${n}`,
    extractor: 'youtube',
    videoId: `v${n}`,
    title: `Video ${n}`,
    thumbnail: null,
    path: `/videos/v${n}.mp4`,
    sizeBytes: 5 * 1024 * 1024,
    finishedAt: Date.UTC(2026, 9, n),
    url: `https://youtu.be/v${n}`,
    ...over,
  }
}

const realEnqueue = useQueue.getState().enqueue

async function setup(items: HistoryItem[], bridge: MockBridge = createMockBridge()) {
  await useSettings.getState().load(bridge)
  await useQueue.getState().load(bridge)
  useHistory.setState({ items })
  const enqueue = vi.fn<(inputs: QueueInput[]) => void>()
  useQueue.setState({ enqueue })
  const user = userEvent.setup()
  render(
    <BridgeProvider bridge={bridge}>
      <ToastProvider>
        <HistoryScreen />
      </ToastProvider>
    </BridgeProvider>,
  )
  return { user, bridge, enqueue }
}

const list = () => screen.getByRole('list', { name: 'Downloads concluídos' })
const rows = () => within(list()).queryAllByRole('listitem')
const titles = () => rows().map((r) => within(r).getByTestId('history-title').textContent)
const rowOf = (title: string) => {
  const row = rows().find((r) => within(r).getByTestId('history-title').textContent === title)
  if (!row) throw new Error(`no row for ${title}`)
  return row
}

beforeEach(async () => {
  useQueue.setState({ enqueue: realEnqueue, jobs: [], activeCount: 0, terminating: [] })
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'history', sidebarCollapsed: false })
  useHistory.setState({ items: [] })
})

describe('order', () => {
  it('lists the newest download first, whatever order the store holds them in', async () => {
    await setup([item(2), item(9), item(5), item(1)])
    expect(titles()).toEqual(['Video 9', 'Video 5', 'Video 2', 'Video 1'])
  })
})

describe('search', () => {
  const sample = () => [
    item(1, { title: 'Big Buck Bunny' }),
    item(2, { title: 'Ação e Emoção' }),
    item(3, { title: 'Café com leite' }),
  ]
  const box = () => screen.getByRole('searchbox', { name: 'Buscar no histórico' })

  it('filters by title, ignoring case', async () => {
    const { user } = await setup(sample())
    await user.type(box(), 'bunny')
    expect(titles()).toEqual(['Big Buck Bunny'])
  })

  it('ignores accents, in both directions', async () => {
    const { user } = await setup(sample())
    await user.type(box(), 'acao')
    expect(titles()).toEqual(['Ação e Emoção'])
    await user.clear(box())
    await user.type(box(), 'CAFE')
    expect(titles()).toEqual(['Café com leite'])
    await user.clear(box())
    expect(titles()).toHaveLength(3)
  })

  it('says so when nothing matches, and does not pretend the history is empty', async () => {
    const { user } = await setup(sample())
    await user.type(box(), 'zzz')
    expect(screen.getByText('Nenhum resultado para “zzz”.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Downloads concluídos' })).not.toBeInTheDocument()
    expect(screen.queryByText('Nada baixado ainda')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ir para Baixar' })).not.toBeInTheDocument()
  })
})

describe('remove', () => {
  it('drops the entry from the history and touches no file', async () => {
    const { user, bridge } = await setup([item(1), item(2)])
    const before = bridge.calls.length
    await user.click(within(rowOf('Video 1')).getByRole('button', { name: 'Remover do histórico' }))
    expect(titles()).toEqual(['Video 2'])
    expect(useHistory.getState().items.map((i) => i.id)).toEqual(['h2'])
    // Nothing reached the bridge: no open, no reveal, and it has no way to delete a file anyway.
    expect(bridge.calls.slice(before)).toEqual([])
  })
})

describe('download again', () => {
  it('queues the url with the default options', async () => {
    const { user, enqueue } = await setup([
      item(1, { title: 'Aula', thumbnail: 'https://t/1.jpg' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Baixar de novo' }))
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith([
      {
        url: 'https://youtu.be/v1',
        title: 'Aula',
        thumbnail: 'https://t/1.jpg',
        extractor: 'youtube',
        videoId: 'v1',
        opts: defaultDownloadOptions(useSettings.getState().settings),
      },
    ])
    expect(useUi.getState().screen).toBe('queue')
  })

  it('is hidden for an item saved without a url', async () => {
    await setup([item(1, { url: undefined })])
    expect(screen.queryByRole('button', { name: 'Baixar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover do histórico' })).toBeInTheDocument()
  })
})

describe('open and reveal', () => {
  it('open the file and its folder through the bridge', async () => {
    const { user, bridge } = await setup([item(1)])
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: 'Mostrar na pasta' }))
    expect(bridge.calls).toEqual(
      expect.arrayContaining([
        { method: 'os.openPath', args: ['/videos/v1.mp4'] },
        { method: 'os.revealPath', args: ['/videos/v1.mp4'] },
      ]),
    )
  })

  it('are hidden when the file path is unknown', async () => {
    await setup([item(1, { path: '' })])
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostrar na pasta' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar de novo' })).toBeInTheDocument()
  })

  it('show a toast when the system call fails', async () => {
    const bridge = createMockBridge()
    bridge.os.openPath = () => Promise.reject(new Error('gone'))
    const { user } = await setup([item(1)], bridge)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByText('A ação falhou: gone')).toBeInTheDocument()
  })
})

describe('empty history', () => {
  it('says "Nada baixado ainda" and the button goes to Baixar', async () => {
    const { user } = await setup([])
    expect(screen.getByText('Nada baixado ainda')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ir para Baixar' }))
    expect(useUi.getState().screen).toBe('download')
  })
})

describe('row details', () => {
  it('shows the size and the date of the download', async () => {
    await setup([item(3, { sizeBytes: 5 * 1024 * 1024, finishedAt: Date.UTC(2026, 9, 3, 15) })])
    const row = rowOf('Video 3')
    expect(within(row).getByText('5 MB')).toBeInTheDocument()
    expect(within(row).getByText(/2026/)).toBeInTheDocument()
  })

  it('leaves the size out when it is not known', async () => {
    await setup([item(3, { sizeBytes: null })])
    expect(within(rowOf('Video 3')).queryByText(/MB|KB|GB/)).not.toBeInTheDocument()
  })
})

describe('a long history is virtualised', () => {
  it('renders fewer than 60 rows for 5000 items and reaches the last by scrolling', async () => {
    await setup(Array.from({ length: 5000 }, (_, i) => item(i + 1, { finishedAt: i + 1 })))
    expect(rows()[0]).toHaveAttribute('aria-setsize', '5000')
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().length).toBeLessThan(60)
    // newest first, so the oldest ("Video 1") is the 5000th
    expect(screen.queryByText('Video 1')).not.toBeInTheDocument()

    const scroller = screen.getByTestId('history-scroll')
    scroller.scrollTop = 5000 * ROW_HEIGHT
    fireEvent.scroll(scroller)

    expect(await screen.findByText('Video 1')).toBeInTheDocument()
    expect(rows().length).toBeLessThan(60)
  })
})
