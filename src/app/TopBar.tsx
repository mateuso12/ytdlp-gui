import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import { useUi } from '../stores/ui'
import { APP_NAME } from './brand'
import styles from './TopBar.module.css'

interface TopBarProps {
  /**
   * Slot for the link field (injected by Task 14). Contract: the field's input must carry
   * `id="url-field"`; the Ctrl/Cmd+V shortcut in `App` focuses it by that id.
   */
  urlSlot?: ReactNode
}

export function TopBar({ urlSlot }: TopBarProps) {
  const { t } = useTranslation()
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggleSidebar = useUi((s) => s.toggleSidebar)

  return (
    <header className={styles.top}>
      <div className={styles.brand}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={t('topbar.toggleSidebar')}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          onClick={toggleSidebar}
        >
          <Icon name="menu" />
        </button>
        <span className={styles.name}>{APP_NAME}</span>
      </div>
      <div className={styles.urlSlot}>{urlSlot}</div>
      <div className={styles.right} />
    </header>
  )
}
