import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { APP_NAME } from './app/brand'
import { applyTheme } from './app/theme'
import { bridge, BridgeProvider } from './bridge'
import './i18n'
import { bootstrapStores } from './stores/bootstrap'
import './styles/global.css'

document.title = APP_NAME
applyTheme('system', window.matchMedia('(prefers-color-scheme: dark)').matches)

bootstrapStores(bridge).catch((error: unknown) => console.error('store bootstrap failed', error))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BridgeProvider bridge={bridge}>
      <App />
    </BridgeProvider>
  </React.StrictMode>,
)
