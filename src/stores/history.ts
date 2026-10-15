import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Bridge } from '../bridge/types'
import { createWriter } from './persist'

export interface HistoryItem {
  id: string
  extractor: string
  videoId: string
  title: string
  thumbnail: string | null
  /** Final file path; '' when yt-dlp never reported one. */
  path: string
  sizeBytes: number | null
  finishedAt: number
}

export interface HistoryState {
  /** Newest first. */
  items: HistoryItem[]
  load(bridge: Bridge): Promise<void>
  add(item: HistoryItem): void
  remove(id: string): void
  has(extractor: string, videoId: string): boolean
  search(q: string): HistoryItem[]
  /** Resolves when every pending write has reached the store. */
  flush(): Promise<void>
}

/**
 * Stores are created by factories so each test gets a fresh one; the app uses
 * the module singleton `useHistory`. Call `load(bridge)` once at startup.
 */
export function createHistoryStore() {
  let bridge: Bridge | null = null

  const writer = createWriter(
    'history',
    () => bridge,
    () => store.getState().items,
  )
  const store: UseBoundStore<StoreApi<HistoryState>> = create<HistoryState>()((set, get) => ({
    items: [],

    async load(b) {
      bridge = b
      const stored = await b.store.get<HistoryItem[]>('history')
      if (!Array.isArray(stored)) return
      // Merge: anything added while the read was in flight stays on top.
      set((s) => ({
        items: [...s.items, ...stored.filter((i) => !s.items.some((x) => x.id === i.id))],
      }))
    },

    add(item) {
      set((s) => ({ items: [item, ...s.items.filter((i) => i.id !== item.id)] }))
      void writer.write()
    },

    remove(id) {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      void writer.write()
    },

    has: (extractor, videoId) =>
      get().items.some((i) => i.extractor === extractor && i.videoId === videoId),

    search(q) {
      const needle = q.trim().toLowerCase()
      if (!needle) return get().items
      return get().items.filter((i) => i.title.toLowerCase().includes(needle))
    },

    flush: () => writer.settled(),
  }))

  return store
}

export type HistoryStore = ReturnType<typeof createHistoryStore>

export const useHistory = createHistoryStore()
