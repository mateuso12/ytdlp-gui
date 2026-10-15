import type { ReactNode } from 'react'
import { ProbeContext, useProbeController } from './useProbe'

/**
 * Owns the link-analysis state. It sits above the app shell so the link field in the top bar and
 * the Download screen share it, and so it survives switching screens.
 */
export function ProbeProvider({ children }: { children: ReactNode }) {
  const probe = useProbeController()
  return <ProbeContext.Provider value={probe}>{children}</ProbeContext.Provider>
}
