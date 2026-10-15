import { createContext, useContext, type ReactNode } from 'react'
import type { Bridge } from './types'

export const BridgeContext = createContext<Bridge | null>(null)

/** Gives the component tree its Bridge: the Tauri one in the app, a mock in tests. */
export function BridgeProvider({ bridge, children }: { bridge: Bridge; children: ReactNode }) {
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>
}

export function useBridge(): Bridge {
  const bridge = useContext(BridgeContext)
  if (!bridge) throw new Error('useBridge must be used inside a <BridgeProvider>')
  return bridge
}
