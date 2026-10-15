import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { App } from '../app/App'
import { BridgeProvider } from '../bridge/context'
import type { Bridge } from '../bridge/types'
import { ProbeProvider } from '../screens/Download/ProbeProvider'
import { UrlField } from '../screens/Download/UrlField'

/** The shell with the same providers and link field as `main.tsx`. */
export function renderApp(bridge: Bridge, urlSlot: ReactNode = <UrlField />) {
  return render(
    <BridgeProvider bridge={bridge}>
      <ProbeProvider>
        <App urlSlot={urlSlot} />
      </ProbeProvider>
    </BridgeProvider>,
  )
}
