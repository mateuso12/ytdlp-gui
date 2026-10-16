import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { APP_NAME } from './app/brand'
import { reportCspViolations } from './app/cspReport'
import { applyTheme } from './app/theme'
import { bridge, BridgeProvider } from './bridge'
import { syncWithSplash } from './components/BrandLoader'
import './i18n'
import { ProbeProvider } from './screens/Download/ProbeProvider'
import { UrlField } from './screens/Download/UrlField'
import { bootstrapStores } from './stores/bootstrap'
import './styles/global.css'

if (import.meta.env.DEV) reportCspViolations()

document.title = APP_NAME
applyTheme('system', window.matchMedia('(prefers-color-scheme: dark)').matches)

bootstrapStores(bridge).catch((error: unknown) => console.error('store bootstrap failed', error))

// Let the first BrandLoader continue the splash animation instead of restarting it.
const boot = document.getElementById('boot')
const splashTime = document
  .getAnimations()
  .filter((a) => a instanceof CSSAnimation && boot?.contains((a.effect as KeyframeEffect).target))
  .map((a) => Number(a.currentTime ?? 0))
syncWithSplash(splashTime.length ? Math.max(...splashTime) : 0)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BridgeProvider bridge={bridge}>
      <ProbeProvider>
        <App urlSlot={<UrlField />} />
      </ProbeProvider>
    </BridgeProvider>
  </React.StrictMode>,
)
