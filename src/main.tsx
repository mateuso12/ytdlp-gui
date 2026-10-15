import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme } from './app/theme'
import './styles/global.css'

applyTheme('system', window.matchMedia('(prefers-color-scheme: dark)').matches)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
