import type { Bridge } from '../bridge/types'
import { useHistory } from './history'
import { startScheduler, useQueue } from './queue'
import { startSettingsEffects, useSettings } from './settings'

/**
 * Loads the persisted stores, then starts the scheduler and the language/theme
 * effects. Order matters: settings first (concurrency, language, theme), the
 * queue before the scheduler (restored `queued` jobs start immediately).
 * Resolves to a teardown that also flushes the debounced settings write.
 */
export async function bootstrapStores(bridge: Bridge): Promise<() => void> {
  await Promise.all([useSettings.getState().load(bridge), useHistory.getState().load(bridge)])
  await useQueue.getState().load(bridge)
  const stopEffects = startSettingsEffects(useSettings)
  const stopScheduler = await startScheduler(bridge)

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
    stopScheduler()
    stopEffects()
    flush()
  }
}
