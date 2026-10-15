import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { App } from '../app/App'
import { BridgeProvider } from '../bridge/context'
import type { Bridge } from '../bridge/types'
import { ProbeProvider } from '../screens/Download/ProbeProvider'
import { UrlField } from '../screens/Download/UrlField'
import { useDeps } from '../stores/deps'
import { ALL_INSTALLED } from './fixtures'

/**
 * The shell with the same providers and link field as `main.tsx`. The engine status starts as
 * "everything installed", so the first render is the shell and not the first-run setup (pass a
 * bridge whose `deps` say otherwise to test the setup).
 */
export function renderApp(bridge: Bridge, urlSlot: ReactNode = <UrlField />) {
  useDeps.setState({ status: ALL_INSTALLED, failed: false })
  return render(
    <BridgeProvider bridge={bridge}>
      <ProbeProvider>
        <App urlSlot={urlSlot} />
      </ProbeProvider>
    </BridgeProvider>,
  )
}
