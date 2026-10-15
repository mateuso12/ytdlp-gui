import { create } from 'zustand'
import type { Bridge, DepsStatus } from '../bridge/types'

interface DepsState {
  /** What is installed; `null` until the first `refresh` answers. */
  status: DepsStatus | null
  /** The last read failed (the status may still be the older one, or `null` if none ever worked). */
  failed: boolean
  /**
   * Reads `deps.status()` again. Call it on startup and after anything that changes what is
   * installed (`deps.update`, `deps.install`) so every view of the engine (sidebar, Settings)
   * agrees. A failed read keeps the last known status and raises `failed`; a slow older read
   * never overwrites a newer one.
   */
  refresh(bridge: Bridge): Promise<void>
}

let latest = 0

export const useDeps = create<DepsState>((set) => ({
  status: null,
  failed: false,
  async refresh(bridge) {
    const ticket = ++latest
    try {
      const status = await bridge.deps.status()
      if (ticket === latest) set({ status, failed: false })
    } catch (error) {
      console.error('could not read the engine status', error)
      if (ticket === latest) set({ failed: true })
    }
  },
}))
