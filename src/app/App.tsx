import { useEffect, type ReactNode } from 'react'
import { ToastProvider } from '../components/Toast'
import { DownloadScreen } from '../screens/Download'
import { HistoryScreen } from '../screens/History'
import { QueueScreen } from '../screens/Queue'
import { SettingsScreen } from '../screens/Settings'
import { useUi, type Screen } from '../stores/ui'
import styles from './App.module.css'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const SCREENS: Record<Screen, () => ReactNode> = {
  download: DownloadScreen,
  queue: QueueScreen,
  history: HistoryScreen,
  settings: SettingsScreen,
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * Ctrl/Cmd+V outside an editable element focuses the link field. Contract with Task 14: the
 * field's input has `id="url-field"`. The default paste action is not prevented, so the browser
 * pastes into the newly focused field.
 */
function useFocusUrlFieldOnPaste() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      // Plain Ctrl/Cmd+V only: Ctrl+Shift+V (paste as plain text) and Alt combinations are other commands.
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'v') return
      if (isEditable(e.target)) return
      document.getElementById('url-field')?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

interface AppProps {
  /** The link field, injected into the top bar (Task 14). */
  urlSlot?: ReactNode
}

export function App({ urlSlot }: AppProps) {
  const screen = useUi((s) => s.screen)
  const Current = SCREENS[screen]
  useFocusUrlFieldOnPaste()

  return (
    <ToastProvider>
      <div className={styles.app}>
        <TopBar urlSlot={urlSlot} />
        <div className={styles.body}>
          <Sidebar />
          <main className={styles.main}>
            <Current />
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
