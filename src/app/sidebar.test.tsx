import { act, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeProvider } from '../bridge/context'
import { createMockBridge, type MockBridge, type MockScript } from '../bridge/mock'
import i18n from '../i18n'
import { useDeps } from '../stores/deps'
import { useSettings } from '../stores/settings'
import { useUi } from '../stores/ui'
import { Sidebar } from './Sidebar'

const DEPS: MockScript['deps'] = {
  ytdlp: { path: '/bin/yt-dlp', version: '2026.10.09' },
  ffmpeg: { path: '/bin/ffmpeg', version: '7.1', source: 'system' },
  deno: { path: '/app/deno', version: '2.1.4', source: 'app' },
}

async function setup(bridge: MockBridge = createMockBridge({ deps: DEPS })) {
  await useSettings.getState().load(bridge)
  render(
    <BridgeProvider bridge={bridge}>
      <Sidebar />
    </BridgeProvider>,
  )
  return bridge
}

const engine = () => screen.getByRole('region', { name: 'Motor' })

beforeEach(async () => {
  await act(() => i18n.changeLanguage('pt-BR'))
  useUi.setState({ screen: 'download', sidebarCollapsed: false, settingsSection: null })
  useDeps.setState({ status: null })
})

describe('Sidebar: Motor block', () => {
  it('shows the yt-dlp, ffmpeg and Deno versions and the cookies browser', async () => {
    await setup()
    const block = engine()
    expect(await within(block).findByText('2026.10.09')).toBeInTheDocument()
    expect(within(block).getByText('7.1')).toBeInTheDocument()
    expect(within(block).getByText('2.1.4')).toBeInTheDocument()
    expect(within(block).getByText('Nenhum')).toBeInTheDocument()
    expect(within(block).getByText('yt-dlp')).toBeInTheDocument()
    expect(within(block).getByText('ffmpeg')).toBeInTheDocument()
    expect(within(block).getByText('Deno')).toBeInTheDocument()
    expect(within(block).getByText('Cookies')).toBeInTheDocument()
  })

  it('shows the cookies browser from the settings, live', async () => {
    await setup()
    await within(engine()).findByText('2026.10.09')
    act(() => useSettings.getState().update({ cookiesBrowser: 'firefox' }))
    expect(within(engine()).getByText('Firefox')).toBeInTheDocument()
  })

  it('marks a missing tool instead of leaving a hole', async () => {
    await setup(createMockBridge({ deps: { ytdlp: DEPS.ytdlp, ffmpeg: null, deno: null } }))
    await within(engine()).findByText('2026.10.09')
    expect(within(engine()).getAllByText('Não instalado')).toHaveLength(2)
  })

  it('follows the shared status when it is refreshed after an update or install', async () => {
    const bridge = await setup()
    await within(engine()).findByText('2026.10.09')
    await act(() => bridge.deps.update('stable'))
    // nothing changed on screen yet: the sidebar only re-reads when told to
    expect(within(engine()).getByText('2026.10.09')).toBeInTheDocument()
    await act(() => useDeps.getState().refresh(bridge))
    await waitFor(() => expect(within(engine()).getByText('2099.01.01')).toBeInTheDocument())
  })
})

describe('deps status store', () => {
  it('keeps the previous status when a refresh fails', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    await useDeps.getState().refresh(bridge)
    const before = useDeps.getState().status
    expect(before?.ytdlp?.version).toBe('2026.10.09')
    bridge.deps.status = () => Promise.reject(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await useDeps.getState().refresh(bridge)
    spy.mockRestore()
    expect(useDeps.getState().status).toBe(before)
  })

  it('an older, slower refresh never overwrites a newer one', async () => {
    const bridge = createMockBridge({ deps: DEPS })
    let release: (s: Awaited<ReturnType<MockBridge['deps']['status']>>) => void = () => {}
    const slow = new Promise<Awaited<ReturnType<MockBridge['deps']['status']>>>((r) => {
      release = r
    })
    const realStatus = bridge.deps.status
    bridge.deps.status = () => slow
    const first = useDeps.getState().refresh(bridge)
    bridge.deps.status = realStatus
    await useDeps.getState().refresh(bridge)
    release({ ytdlp: { path: 'p', version: 'old' }, ffmpeg: null, deno: null })
    await first
    expect(useDeps.getState().status?.ytdlp?.version).toBe('2026.10.09')
  })
})
