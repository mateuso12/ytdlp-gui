import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { applyTheme } from '../app/theme'
import type { Bridge } from '../bridge/types'
import type { Settings } from '../core/types'
import i18n, { detectLocale } from '../i18n'
import { createWriter } from './persist'

export const SETTINGS_DEBOUNCE_MS = 300

/** The settings a fresh install starts with. */
export async function defaultSettings(bridge: Bridge): Promise<Settings> {
  const sep = bridge.os.platform() === 'windows' ? '\\' : '/'
  const videos = (await bridge.os.videoDir()).replace(/[\\/]+$/, '')
  return {
    outputDir: `${videos}${sep}ytdlp-gui`,
    outputTemplate: '%(title)s [%(id)s].%(ext)s',
    concurrency: 2,
    rateLimit: null,
    proxy: null,
    retries: 10,
    cookiesBrowser: 'none',
    theme: 'system',
    language: detectLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
    channel: 'stable',
    defaults: {
      mode: 'video',
      video: { maxHeight: 1080, container: 'mp4' },
      audio: { format: 'mp3', quality: 0 },
    },
  }
}

export interface SettingsState {
  settings: Settings
  loaded: boolean
  load(bridge: Bridge): Promise<void>
  update(patch: Partial<Settings>): void
  /** Writes a pending (debounced) change now. Call when the window is about to go away. */
  flush(): Promise<void>
}

const PLACEHOLDER: Settings = {
  outputDir: '',
  outputTemplate: '%(title)s [%(id)s].%(ext)s',
  concurrency: 2,
  rateLimit: null,
  proxy: null,
  retries: 10,
  cookiesBrowser: 'none',
  theme: 'system',
  language: 'en',
  channel: 'stable',
  defaults: { mode: 'video', video: { maxHeight: 1080, container: 'mp4' } },
}

/**
 * Stores are created by factories so each test gets a fresh one; the app uses
 * the module singleton `useSettings`. Call `load(bridge)` once at startup;
 * `update()` before `load()` finishes is overwritten by the loaded values.
 */
export function createSettingsStore() {
  let bridge: Bridge | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const writer = createWriter(
    'settings',
    () => bridge,
    () => store.getState().settings,
  )
  const store: UseBoundStore<StoreApi<SettingsState>> = create<SettingsState>()((set) => ({
    settings: PLACEHOLDER,
    loaded: false,

    async load(b) {
      bridge = b
      const [defaults, stored] = await Promise.all([
        defaultSettings(b),
        b.store.get<Partial<Settings>>('settings'),
      ])
      const saved = stored ?? {}
      set({
        loaded: true,
        settings: { ...defaults, ...saved, defaults: { ...defaults.defaults, ...saved.defaults } },
      })
    },

    update(patch) {
      set((s) => ({ settings: { ...s.settings, ...patch } }))
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void writer.write()
      }, SETTINGS_DEBOUNCE_MS)
    },

    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
        return writer.write()
      }
      return writer.settled()
    },
  }))
  return store
}

export type SettingsStore = ReturnType<typeof createSettingsStore>

export const useSettings = createSettingsStore()

/**
 * Makes the settings drive the language (i18next) and the theme (`<html data-theme>`),
 * and re-resolves the theme when the OS switches between light and dark.
 * Returns the teardown.
 */
export function startSettingsEffects(store: SettingsStore = useSettings): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const { theme, language } = store.getState().settings
    applyTheme(theme, media.matches)
    if (i18n.language !== language) void i18n.changeLanguage(language)
  }
  apply()
  const unsubscribe = store.subscribe(apply)
  media.addEventListener('change', apply)
  return () => {
    unsubscribe()
    media.removeEventListener('change', apply)
  }
}
