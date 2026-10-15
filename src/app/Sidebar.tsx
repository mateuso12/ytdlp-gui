import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/Icon'
import { useQueue } from '../stores/queue'
import { useUi, type Screen } from '../stores/ui'
import styles from './Sidebar.module.css'

const ITEMS: { screen: Screen; icon: IconName }[] = [
  { screen: 'download', icon: 'download' },
  { screen: 'queue', icon: 'list-video' },
  { screen: 'history', icon: 'history' },
]

export function Sidebar() {
  const { t } = useTranslation()
  const current = useUi((s) => s.screen)
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const go = useUi((s) => s.go)
  const activeCount = useQueue((s) => s.activeCount)

  const item = (screen: Screen, icon: IconName) => (
    <button
      key={screen}
      type="button"
      className={`${styles.item} ${current === screen ? styles.on : ''}`}
      aria-current={current === screen ? 'page' : undefined}
      onClick={() => go(screen)}
    >
      <Icon name={icon} />
      <span className={styles.label}>{t(`nav.${screen}`)}</span>
      {screen === 'queue' && activeCount > 0 ? (
        <span className={styles.cnt}>{t('nav.active', { count: activeCount })}</span>
      ) : null}
    </button>
  )

  return (
    <aside id="app-sidebar" className={`${styles.guide} ${collapsed ? styles.collapsed : ''}`}>
      <nav aria-label={t('nav.label')}>
        {ITEMS.map(({ screen, icon }) => item(screen, icon))}
        <hr className={styles.sep} />
        {item('settings', 'settings-2')}
      </nav>
      {/* Filled in Task 19 (yt-dlp, ffmpeg and cookies status). */}
      <section className={styles.engine} aria-labelledby="engine-heading">
        <hr className={styles.sep} />
        <h2 id="engine-heading" className={styles.heading}>
          {t('engine.heading')}
        </h2>
      </section>
    </aside>
  )
}
