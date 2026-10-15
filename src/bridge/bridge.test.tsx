import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { emit } from '@tauri-apps/api/event'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bridge,
  BridgeProvider,
  createTauriBridge,
  useBridge,
  type ExitEvent,
  type LineEvent,
} from './index'
import { createMockBridge } from './mock'

type Call = { cmd: string; args: Record<string, unknown> }

/** Installs mockIPC with event support and records every invoke. */
function ipc(handlers: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: Call[] = []
  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Record<string, unknown>
      calls.push({ cmd, args })
      return handlers[cmd]?.(args)
    },
    { shouldMockEvents: true },
  )
  return calls
}

afterEach(() => {
  clearMocks()
  delete (window as { __TAURI_OS_PLUGIN_INTERNALS__?: unknown }).__TAURI_OS_PLUGIN_INTERNALS__
})

describe('tauri bridge: processes', () => {
  it('probe invokes run_ytdlp_capture with the args and returns the capture', async () => {
    const calls = ipc({ run_ytdlp_capture: () => ({ code: 0, stdout: '{}', stderr: '' }) })
    const res = await bridge.probe(['-J', 'https://example.com/v'])
    expect(res).toEqual({ code: 0, stdout: '{}', stderr: '' })
    expect(calls).toContainEqual({
      cmd: 'run_ytdlp_capture',
      args: { args: ['-J', 'https://example.com/v'] },
    })
  })

  it('run passes jobId (camelCase) and args', async () => {
    const calls = ipc({ run_ytdlp: () => null })
    await bridge.run('job-1', ['-f', 'best', 'u'])
    expect(calls).toContainEqual({
      cmd: 'run_ytdlp',
      args: { jobId: 'job-1', args: ['-f', 'best', 'u'] },
    })
  })

  it('cancel passes jobId and returns the boolean', async () => {
    const calls = ipc({ cancel_job: () => true })
    await expect(bridge.cancel('job-1')).resolves.toBe(true)
    expect(calls).toContainEqual({ cmd: 'cancel_job', args: { jobId: 'job-1' } })
  })

  it('onLine delivers the typed payload and the unlisten stops delivery', async () => {
    ipc()
    const seen: LineEvent[] = []
    const off = await bridge.onLine((e) => seen.push(e))
    const payload: LineEvent = { jobId: 'j', stream: 'stdout', line: 'hello' }
    await emit('job://line', payload)
    expect(seen).toEqual([payload])
    off()
    await emit('job://line', payload)
    expect(seen).toHaveLength(1)
  })

  it('onExit delivers the typed payload, including a null code', async () => {
    ipc()
    const seen: ExitEvent[] = []
    await bridge.onExit((e) => seen.push(e))
    await emit('job://exit', { jobId: 'j', code: null })
    await emit('job://exit', { jobId: 'k', code: 0 })
    expect(seen).toEqual([
      { jobId: 'j', code: null },
      { jobId: 'k', code: 0 },
    ])
  })
})

describe('tauri bridge: deps', () => {
  it('status returns the Rust payload as is', async () => {
    const status = {
      ytdlp: { path: '/b/yt-dlp', version: '2026.01.01' },
      ffmpeg: { path: '/b/ffmpeg', version: '7', source: 'system' },
      deno: null,
    }
    ipc({ deps_status: () => status })
    await expect(bridge.deps.status()).resolves.toEqual(status)
  })

  it('install passes the lowercase dependency name', async () => {
    const calls = ipc({ deps_install: () => null })
    await bridge.deps.install('deno')
    expect(calls).toContainEqual({ cmd: 'deps_install', args: { which: 'deno' } })
  })

  it('update passes the channel and returns the new version', async () => {
    const calls = ipc({ deps_update_ytdlp: () => '2026.02.02' })
    await expect(bridge.deps.update('nightly')).resolves.toBe('2026.02.02')
    expect(calls).toContainEqual({ cmd: 'deps_update_ytdlp', args: { channel: 'nightly' } })
  })

  it('onProgress delivers deps://progress payloads', async () => {
    ipc()
    const cb = vi.fn()
    await bridge.deps.onProgress(cb)
    await emit('deps://progress', { which: 'ffmpeg', received: 10, total: null })
    expect(cb).toHaveBeenCalledWith({ which: 'ffmpeg', received: 10, total: null })
  })
})

describe('tauri bridge: store', () => {
  function storeIpc(data: Record<string, unknown> = {}) {
    return ipc({
      'plugin:store|load': () => 7,
      'plugin:store|get': ({ key }) => {
        const k = key as string
        return k in data ? [data[k], true] : [null, false]
      },
      'plugin:store|set': ({ key, value }) => {
        data[key as string] = value
      },
      'plugin:store|save': () => null,
    })
  }

  it('get returns undefined for a missing key and the value otherwise', async () => {
    storeIpc({ theme: 'dark' })
    await expect(bridge.store.get('theme')).resolves.toBe('dark')
    await expect(bridge.store.get('nope')).resolves.toBeUndefined()
  })

  it('opens settings.json once, with auto-save off', async () => {
    const calls = storeIpc()
    const fresh = createTauriBridge()
    await fresh.store.get('a')
    await fresh.store.get('b')
    const loads = calls.filter((c) => c.cmd === 'plugin:store|load')
    expect(loads).toHaveLength(1)
    expect(loads[0].args.path).toBe('settings.json')
    expect(loads[0].args.options).toMatchObject({ autoSave: false })
  })

  it('set writes the value and then saves to disk', async () => {
    const calls = storeIpc()
    await bridge.store.set('concurrency', 3)
    const names = calls.map((c) => c.cmd)
    expect(names.indexOf('plugin:store|set')).toBeLessThan(names.indexOf('plugin:store|save'))
    expect(calls.find((c) => c.cmd === 'plugin:store|set')?.args).toMatchObject({
      key: 'concurrency',
      value: 3,
    })
    await expect(bridge.store.get('concurrency')).resolves.toBe(3)
  })
})

describe('tauri bridge: os', () => {
  it('openPath and revealPath use the opener plugin', async () => {
    const calls = ipc()
    await bridge.os.openPath('C:\\v\\a.mp4')
    await bridge.os.revealPath('C:\\v\\a.mp4')
    expect(calls.find((c) => c.cmd === 'plugin:opener|open_path')?.args).toMatchObject({
      path: 'C:\\v\\a.mp4',
    })
    expect(calls).toContainEqual({
      cmd: 'plugin:opener|reveal_item_in_dir',
      args: { paths: ['C:\\v\\a.mp4'] },
    })
  })

  it('pickFolder asks for a single directory and passes the result through', async () => {
    const calls = ipc({ 'plugin:dialog|open': () => 'C:\\Videos' })
    await expect(bridge.os.pickFolder()).resolves.toBe('C:\\Videos')
    const opts = calls.find((c) => c.cmd === 'plugin:dialog|open')?.args.options
    expect(opts).toMatchObject({ directory: true, multiple: false })
  })

  it('pickFolder resolves to null when cancelled', async () => {
    ipc({ 'plugin:dialog|open': () => null })
    await expect(bridge.os.pickFolder()).resolves.toBeNull()
  })

  it('reads and writes the clipboard as text', async () => {
    const calls = ipc({ 'plugin:clipboard-manager|read_text': () => 'https://x.test' })
    await expect(bridge.os.readClipboard()).resolves.toBe('https://x.test')
    await bridge.os.writeClipboard('copied')
    expect(calls.find((c) => c.cmd === 'plugin:clipboard-manager|write_text')?.args).toMatchObject({
      text: 'copied',
    })
  })

  it('videoDir resolves the Video base directory', async () => {
    const calls = ipc({ 'plugin:path|resolve_directory': () => 'C:\\Users\\me\\Videos' })
    await expect(bridge.os.videoDir()).resolves.toBe('C:\\Users\\me\\Videos')
    expect(calls.some((c) => c.cmd === 'plugin:path|resolve_directory')).toBe(true)
  })

  it.each([
    ['windows', 'windows'],
    ['macos', 'macos'],
    ['linux', 'linux'],
    ['freebsd', 'linux'],
    ['android', 'linux'],
  ] as const)('platform maps %s to %s', (raw, expected) => {
    ;(
      window as unknown as { __TAURI_OS_PLUGIN_INTERNALS__: unknown }
    ).__TAURI_OS_PLUGIN_INTERNALS__ = { platform: raw }
    expect(bridge.os.platform()).toBe(expected)
  })
})

describe('tauri bridge: updater', () => {
  it('check resolves to null when up to date', async () => {
    ipc({ 'plugin:updater|check': () => null })
    await expect(bridge.updater.check()).resolves.toBeNull()
  })

  it('check exposes the version and install() downloads and installs it', async () => {
    const calls = ipc({
      'plugin:updater|check': () => ({
        rid: 9,
        currentVersion: '0.1.0',
        version: '0.2.0',
        rawJson: {},
      }),
      'plugin:updater|download_and_install': () => null,
    })
    const update = await bridge.updater.check()
    expect(update?.version).toBe('0.2.0')
    await update?.install()
    expect(calls.find((c) => c.cmd === 'plugin:updater|download_and_install')?.args.rid).toBe(9)
  })
})

describe('createMockBridge', () => {
  it('emitLine reaches subscribers and unsubscribe stops it', async () => {
    const mock = createMockBridge()
    const seen: LineEvent[] = []
    const off = await mock.onLine((e) => seen.push(e))
    mock.emitLine({ jobId: 'j', stream: 'stdout', line: 'a' })
    off()
    mock.emitLine({ jobId: 'j', stream: 'stdout', line: 'b' })
    expect(seen).toEqual([{ jobId: 'j', stream: 'stdout', line: 'a' }])
  })

  it('emitExit and emitDepsProgress reach their subscribers', async () => {
    const mock = createMockBridge()
    const exits: ExitEvent[] = []
    const progress = vi.fn()
    await mock.onExit((e) => exits.push(e))
    await mock.deps.onProgress(progress)
    mock.emitExit({ jobId: 'j', code: 0 })
    mock.emitDepsProgress({ which: 'ytdlp', received: 1, total: 2 })
    expect(exits).toEqual([{ jobId: 'j', code: 0 }])
    expect(progress).toHaveBeenCalledWith({ which: 'ytdlp', received: 1, total: 2 })
  })

  it('probe answers from the script by full args or by URL, and records the call', async () => {
    const ok = { code: 0, stdout: '{"id":"x"}', stderr: '' }
    const mock = createMockBridge({
      probes: {
        'https://a.test/v': ok,
        '-J --flat-playlist https://b.test/p': { ...ok, stdout: 'P' },
      },
    })
    await expect(mock.probe(['-J', 'https://a.test/v'])).resolves.toEqual(ok)
    await expect(mock.probe(['-J', '--flat-playlist', 'https://b.test/p'])).resolves.toMatchObject({
      stdout: 'P',
    })
    expect(mock.calls[0]).toEqual({ method: 'probe', args: [['-J', 'https://a.test/v']] })
  })

  it('probe falls back to a failing capture for unscripted args', async () => {
    const mock = createMockBridge()
    const res = await mock.probe(['-J', 'https://unknown.test'])
    expect(res.code).not.toBe(0)
    expect(res.stderr).toContain('https://unknown.test')
  })

  it('run, cancel and exit track the running jobs', async () => {
    const mock = createMockBridge()
    await mock.run('j1', ['u'])
    await expect(mock.cancel('j1')).resolves.toBe(true)
    await expect(mock.cancel('j1')).resolves.toBe(false)
    await mock.run('j2', ['u'])
    mock.emitExit({ jobId: 'j2', code: 0 })
    await expect(mock.cancel('j2')).resolves.toBe(false)
  })

  it('a scripted run handler can drive lines and exit', async () => {
    const mock = createMockBridge({
      onRun: (jobId, _args, ctl) => {
        ctl.emitLine({ jobId, stream: 'stdout', line: 'x' })
        ctl.emitExit({ jobId, code: 0 })
      },
    })
    const lines: string[] = []
    await mock.onLine((e) => lines.push(e.line))
    await mock.run('j', [])
    expect(lines).toEqual(['x'])
  })

  it('keeps the store in memory, seeded from the script', async () => {
    const mock = createMockBridge({ store: { theme: 'dark' } })
    await expect(mock.store.get('theme')).resolves.toBe('dark')
    await mock.store.set('theme', 'light')
    await expect(mock.store.get('theme')).resolves.toBe('light')
    await expect(mock.store.get('missing')).resolves.toBeUndefined()
  })

  it('install flips the dep to installed; update returns the scripted version', async () => {
    const mock = createMockBridge({ updateVersion: '2030.01.01' })
    expect((await mock.deps.status()).deno).toBeNull()
    await mock.deps.install('deno')
    expect((await mock.deps.status()).deno?.source).toBe('app')
    await expect(mock.deps.update('stable')).resolves.toBe('2030.01.01')
  })

  it('os helpers use scripted values', async () => {
    const mock = createMockBridge({
      clipboard: 'https://clip.test',
      pickedFolder: 'D:\\Out',
      videoDir: 'D:\\Videos',
      platform: 'macos',
    })
    await expect(mock.os.readClipboard()).resolves.toBe('https://clip.test')
    await mock.os.writeClipboard('new')
    await expect(mock.os.readClipboard()).resolves.toBe('new')
    await expect(mock.os.pickFolder()).resolves.toBe('D:\\Out')
    await expect(mock.os.videoDir()).resolves.toBe('D:\\Videos')
    expect(mock.os.platform()).toBe('macos')
    await mock.os.openPath('p')
    await mock.os.revealPath('p')
    expect(mock.calls.map((c) => c.method)).toEqual(
      expect.arrayContaining(['os.openPath', 'os.revealPath']),
    )
  })

  it('updater.check returns the scripted update and install is recorded', async () => {
    const mock = createMockBridge({ update: { version: '9.9.9' } })
    const update = await mock.updater.check()
    expect(update?.version).toBe('9.9.9')
    await update?.install()
    expect(mock.calls.map((c) => c.method)).toContain('updater.install')
    await expect(createMockBridge().updater.check()).resolves.toBeNull()
  })
})

describe('BridgeProvider', () => {
  function Probe() {
    const b = useBridge()
    return <span>{b.os.platform()}</span>
  }

  it('hands the bridge to useBridge', () => {
    render(
      <BridgeProvider bridge={createMockBridge({ platform: 'linux' })}>
        <Probe />
      </BridgeProvider>,
    )
    expect(screen.getByText('linux')).toBeInTheDocument()
  })

  it('throws a clear error without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/BridgeProvider/)
    spy.mockRestore()
  })
})
