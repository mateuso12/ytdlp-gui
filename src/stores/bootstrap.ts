import type { Bridge } from '../bridge/types'
import { useHistory } from './history'
import { startScheduler, useQueue } from './queue'
import { startSettingsEffects, useSettings } from './settings'

/** Runs one startup step; a failure is logged and never stops the others. */
async function step<T>(name: string, run: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    console.error(`startup: ${name} failed`, error)
    return undefined
  }
}

/**
 * Loads the persisted stores, then starts the scheduler and the language/theme
 * effects. Every step is independent: a failing settings or history load is
 * logged and the app still comes up (defaults / empty list), and the queue
 * always gets loaded so enqueueing works. Order: settings first (concurrency,
 * language, theme), the queue before the scheduler (restored `queued` jobs
 * start immediately). Resolves to a teardown that also flushes the debounced
 * settings write.
 */
export async function bootstrapStores(bridge: Bridge): Promise<() => void> {
  await Promise.all([
    step('settings', () => useSettings.getState().load(bridge)),
    step('history', () => useHistory.getState().load(bridge)),
  ])
  await step('queue', () => useQueue.getState().load(bridge))
  const stopEffects = await step('settings effects', () => startSettingsEffects(useSettings))
  const stopScheduler = await step('scheduler', () => startScheduler(bridge))

  // Best effort: get the debounced settings write out before the window goes away.
  const flush = () => void useSettings.getState().flush()
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)

  return () => {
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onHide)
    stopScheduler?.()
    stopEffects?.()
    flush()
  }
}
