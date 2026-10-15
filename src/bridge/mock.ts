import type {
  Bridge,
  DepName,
  DepsProgress,
  DepsStatus,
  ExitEvent,
  LineEvent,
  Platform,
  ProbeResult,
} from './types'

export type ProbeResponse = ProbeResult | ((args: string[]) => ProbeResult | Promise<ProbeResult>)

/** Handle a scripted `onRun` uses to drive a job's output. */
export interface RunControl {
  emitLine(e: LineEvent): void
  emitExit(e: ExitEvent): void
}

/** What the mock bridge answers with. Every field is optional when passed to `createMockBridge`. */
export interface MockScript {
  /**
   * Probe answers. A key matches either the full args joined by a space
   * (`'-J --flat-playlist https://x/p'`) or any single arg, typically the URL.
   * The full-args key wins.
   */
  probes: Record<string, ProbeResponse>
  /** Used when no probe key matches. Defaults to a failing capture naming the args. */
  fallbackProbe: ProbeResponse
  /** Called by `run`, before it resolves, to script a job's lines and exit. */
  onRun: (jobId: string, args: string[], ctl: RunControl) => void | Promise<void>
  /** Initial `deps.status()` result. Defaults to nothing installed. */
  deps: DepsStatus
  /** What `deps.update()` resolves to (and the ytdlp version afterwards). */
  updateVersion: string
  /** Seed for the in-memory store. */
  store: Record<string, unknown>
  /** Initial clipboard text. */
  clipboard: string
  /** What `pickFolder()` resolves to. `null` simulates a cancelled dialog. */
  pickedFolder: string | null
  videoDir: string
  platform: Platform
  /** The update `updater.check()` finds; `null` means up to date. */
  update: { version: string } | null
}

export interface MockCall {
  method: string
  args: unknown[]
}

export type MockBridge = Bridge & {
  emitLine(e: LineEvent): void
  emitExit(e: ExitEvent): void
  emitDepsProgress(p: DepsProgress): void
  /** Every Bridge call made so far, in order, for assertions. */
  calls: MockCall[]
}

const EMPTY_DEPS: DepsStatus = { ytdlp: null, ffmpeg: null, deno: null }

/**
 * An in-memory Bridge for component tests and Playwright. Fully deterministic:
 * no timers, no randomness, and events fire synchronously when emitted.
 */
export function createMockBridge(fixtures: Partial<MockScript> = {}): MockBridge {
  const script = fixtures
  const calls: MockCall[] = []
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args })
  }

  const lineSubs = new Set<(e: LineEvent) => void>()
  const exitSubs = new Set<(e: ExitEvent) => void>()
  const progressSubs = new Set<(p: DepsProgress) => void>()
  const running = new Set<string>()
  const data = new Map<string, unknown>(Object.entries(script.store ?? {}))
  let deps: DepsStatus = structuredClone(script.deps ?? EMPTY_DEPS)
  let clipboard = script.clipboard ?? ''

  const subscribe = <T>(subs: Set<(e: T) => void>, cb: (e: T) => void) => {
    subs.add(cb)
    return Promise.resolve(() => {
      subs.delete(cb)
    })
  }

  const emitLine = (e: LineEvent) => [...lineSubs].forEach((cb) => cb(e))
  const emitExit = (e: ExitEvent) => {
    running.delete(e.jobId)
    ;[...exitSubs].forEach((cb) => cb(e))
  }
  const emitDepsProgress = (p: DepsProgress) => [...progressSubs].forEach((cb) => cb(p))

  const resolveProbe = (args: string[]): ProbeResponse => {
    const probes = script.probes ?? {}
    const byArgs = probes[args.join(' ')]
    if (byArgs) return byArgs
    const key = args.find((a) => a in probes)
    if (key !== undefined) return probes[key]
    return (
      script.fallbackProbe ?? {
        code: 1,
        stdout: '',
        stderr: `ERROR: no mock probe scripted for: ${args.join(' ')}`,
      }
    )
  }

  const markInstalled = (which: DepName) => {
    const version = `mock-${which}`
    if (which === 'ytdlp') deps = { ...deps, ytdlp: { path: '/mock/bin/yt-dlp', version } }
    else deps = { ...deps, [which]: { path: `/mock/bin/${which}`, version, source: 'app' } }
  }

  return {
    calls,
    emitLine,
    emitExit,
    emitDepsProgress,

    async probe(args) {
      record('probe', args)
      const res = resolveProbe(args)
      return typeof res === 'function' ? res(args) : res
    },
    async run(jobId, args) {
      record('run', jobId, args)
      running.add(jobId)
      await script.onRun?.(jobId, args, { emitLine, emitExit })
    },
    async cancel(jobId) {
      record('cancel', jobId)
      return running.delete(jobId)
    },
    onLine: (cb) => subscribe(lineSubs, cb),
    onExit: (cb) => subscribe(exitSubs, cb),

    deps: {
      async status() {
        record('deps.status')
        return structuredClone(deps)
      },
      async install(which) {
        record('deps.install', which)
        markInstalled(which)
      },
      async update(channel) {
        record('deps.update', channel)
        const version = script.updateVersion ?? '2099.01.01'
        deps = { ...deps, ytdlp: { path: deps.ytdlp?.path ?? '/mock/bin/yt-dlp', version } }
        return version
      },
      onProgress: (cb) => subscribe(progressSubs, cb),
    },

    store: {
      async get<T>(key: string) {
        record('store.get', key)
        return data.get(key) as T | undefined
      },
      async set<T>(key: string, value: T) {
        record('store.set', key, value)
        data.set(key, value)
      },
    },

    os: {
      async openPath(path) {
        record('os.openPath', path)
      },
      async revealPath(path) {
        record('os.revealPath', path)
      },
      async openUrl(url) {
        record('os.openUrl', url)
      },
      async pickFolder() {
        record('os.pickFolder')
        return script.pickedFolder ?? null
      },
      async readClipboard() {
        record('os.readClipboard')
        return clipboard
      },
      async writeClipboard(text) {
        record('os.writeClipboard', text)
        clipboard = text
      },
      async videoDir() {
        record('os.videoDir')
        return script.videoDir ?? '/mock/Videos'
      },
      platform: () => script.platform ?? 'windows',
    },

    updater: {
      async check() {
        record('updater.check')
        const found = script.update
        if (!found) return null
        return {
          version: found.version,
          install: async () => {
            record('updater.install')
          },
        }
      },
    },
  }
}
