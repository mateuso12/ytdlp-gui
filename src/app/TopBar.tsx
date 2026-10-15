import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import type { ThemePref } from '../core/types'
import { useQueue } from '../stores/queue'
import { useSettings } from '../stores/settings'
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

const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }

export function TopBar({ urlSlot }: TopBarProps) {
  const { t } = useTranslation()
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const go = useUi((s) => s.go)
  const activeCount = useQueue((s) => s.activeCount)
  const theme = useSettings((s) => s.settings.theme)
  const themeLabel = t('topbar.theme', { theme: t(`settings.appearance.${theme}`) })

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
      <div className={styles.right}>
        {activeCount > 0 ? (
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.queueBtn}`}
            aria-label={t('topbar.queueBadge', { count: activeCount })}
            onClick={() => go('queue')}
          >
            <Icon name="arrow-down-to-line" />
            <span className={styles.badge} aria-hidden="true">
              {activeCount}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={themeLabel}
          title={themeLabel}
          onClick={() => useSettings.getState().update({ theme: NEXT_THEME[theme] })}
        >
          <Icon name="sun-moon" />
        </button>
      </div>
    </header>
  )
}
