import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { APP_NAME } from './app/brand'
import { applyTheme } from './app/theme'
import './i18n'
import './styles/global.css'

document.title = APP_NAME
applyTheme('system', window.matchMedia('(prefers-color-scheme: dark)').matches)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
