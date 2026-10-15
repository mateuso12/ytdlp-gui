import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { videoDir } from '@tauri-apps/api/path'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { platform } from '@tauri-apps/plugin-os'
import { Store } from '@tauri-apps/plugin-store'
import { check } from '@tauri-apps/plugin-updater'
import type {
  Bridge,
  DepsProgress,
  DepsStatus,
  ExitEvent,
  LineEvent,
  Platform,
  ProbeResult,
} from './types'

export * from './types'
export { BridgeContext, BridgeProvider, useBridge } from './context'

const STORE_FILE = 'settings.json'

/** Subscribes to a Tauri event; resolves to the unlisten function. */
async function subscribe<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  return listen<T>(event, (e) => cb(e.payload))
}

function toPlatform(raw: string): Platform {
  if (raw === 'windows' || raw === 'macos') return raw
  return 'linux' // every other desktop OS is treated as Linux-like
}

/** Builds a bridge backed by Tauri commands, events and plugins. Each one opens its own store handle. */
export function createTauriBridge(): Bridge {
  let storePromise: Promise<Store> | null = null

  /** Opens settings.json once. Writes are flushed explicitly in `store.set`. */
  function getStore(): Promise<Store> {
    storePromise ??= Store.load(STORE_FILE, { defaults: {}, autoSave: false }).catch((err) => {
      storePromise = null // let the next call retry instead of caching a failure
      throw err
    })
    return storePromise
  }

  return {
    probe: (args) => invoke<ProbeResult>('run_ytdlp_capture', { args }),
    run: async (jobId, args) => {
      await invoke('run_ytdlp', { jobId, args })
    },
    cancel: (jobId) => invoke<boolean>('cancel_job', { jobId }),
    onLine: (cb) => subscribe<LineEvent>('job://line', cb),
    onExit: (cb) => subscribe<ExitEvent>('job://exit', cb),
    deps: {
      status: () => invoke<DepsStatus>('deps_status'),
      install: async (which) => {
        await invoke('deps_install', { which })
      },
      update: (channel) => invoke<string>('deps_update_ytdlp', { channel }),
      onProgress: (cb) => subscribe<DepsProgress>('deps://progress', cb),
    },
    store: {
      async get<T>(key: string) {
        return (await getStore()).get<T>(key)
      },
      async set<T>(key: string, value: T) {
        const store = await getStore()
        await store.set(key, value)
        await store.save()
      },
    },
    os: {
      openPath: (path) => openPath(path),
      revealPath: (path) => revealItemInDir(path),
      openUrl: (url) => openUrl(url),
      pickFolder: () => open({ directory: true, multiple: false }),
      readClipboard: async () => (await readText()) ?? '',
      writeClipboard: (text) => writeText(text),
      videoDir: () => videoDir(),
      platform: () => toPlatform(platform()),
    },
    updater: {
      async check() {
        const update = await check()
        if (!update) return null
        return {
          version: update.version,
          install: () => update.downloadAndInstall(),
        }
      },
    },
  }
}

export const bridge: Bridge = createTauriBridge()
