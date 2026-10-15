import type { Bridge } from '../bridge/types'

export interface Writer {
  /** Queues a write of the current value. Resolves when that write has finished. */
  write(): Promise<void>
  /** Resolves when every write requested so far has finished. */
  settled(): Promise<void>
}

/**
 * Serialised, coalescing writer for one key of the persistent store.
 *
 * Writes are chained so they reach the store in the order they were requested,
 * and the value is read when the write actually runs, so whatever is queued
 * behind a slow write always ends up persisting the latest state. Failures are
 * swallowed (persistence is best-effort and must never break the UI) but do not
 * break the chain.
 */
export function createWriter<T>(
  key: string,
  getBridge: () => Bridge | null,
  getValue: () => T,
): Writer {
  let chain: Promise<void> = Promise.resolve()
  return {
    /** Queues a write of the current value. Resolves when that write has finished. */
    write(): Promise<void> {
      const next = chain.then(async () => {
        const bridge = getBridge()
        if (!bridge) return
        try {
          await bridge.store.set(key, getValue())
        } catch {
          // best effort
        }
      })
      chain = next
      return next
    },
    /** Resolves when every write requested so far has finished. */
    settled(): Promise<void> {
      return chain
    },
  }
}
