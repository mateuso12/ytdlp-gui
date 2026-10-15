import { create } from 'zustand'
import type { Bridge, DepsStatus } from '../bridge/types'

interface DepsState {
  /** What is installed; `null` until the first `refresh` answers. */
  status: DepsStatus | null
  /**
   * Reads `deps.status()` again. Call it on startup and after anything that changes what is
   * installed (`deps.update`, `deps.install`) so every view of the engine (sidebar, Settings)
   * agrees. A failed read keeps the last known status; a slow older read never overwrites a
   * newer one.
   */
  refresh(bridge: Bridge): Promise<void>
}

let latest = 0

export const useDeps = create<DepsState>((set) => ({
  status: null,
  async refresh(bridge) {
    const ticket = ++latest
    try {
      const status = await bridge.deps.status()
      if (ticket === latest) set({ status })
    } catch (error) {
      console.error('could not read the engine status', error)
    }
  },
}))
