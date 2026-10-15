import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../bridge/context'
import { Icon, type IconName } from '../components/Icon'
import { useDeps } from '../stores/deps'
import { useQueue } from '../stores/queue'
import { useSettings } from '../stores/settings'
import { useUi, type Screen } from '../stores/ui'
import styles from './Sidebar.module.css'

const ITEMS: { screen: Screen; icon: IconName }[] = [
  { screen: 'download', icon: 'download' },
  { screen: 'queue', icon: 'list-video' },
  { screen: 'history', icon: 'history' },
]

/** One line of the Motor block: icon, name and the value in mono type. */
function EngineLine({ icon, name, value }: { icon: IconName; name: string; value: string }) {
  return (
    <div className={styles.dep}>
      <Icon name={icon} size={16} />
      <span>{name}</span>
      <b className={styles.depValue}>{value}</b>
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const deps = useDeps((s) => s.status)
  const cookiesBrowser = useSettings((s) => s.settings.cookiesBrowser)
  const current = useUi((s) => s.screen)
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const go = useUi((s) => s.go)
  const activeCount = useQueue((s) => s.activeCount)

  // Read once on mount; anything that installs or updates a tool refreshes the shared status.
  useEffect(() => {
    void useDeps.getState().refresh(bridge)
  }, [bridge])
  const missing = t('engine.notInstalled')
  // Before the first answer there is nothing to show yet.
  const version = (v: string | undefined) => (deps ? (v ?? missing) : '…')

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
      <section className={styles.engine} aria-labelledby="engine-heading">
        <hr className={styles.sep} />
        <h2 id="engine-heading" className={styles.heading}>
          {t('engine.heading')}
        </h2>
        <EngineLine icon="cpu" name="yt-dlp" value={version(deps?.ytdlp?.version)} />
        <EngineLine icon="film" name="ffmpeg" value={version(deps?.ffmpeg?.version)} />
        <EngineLine icon="terminal" name="Deno" value={version(deps?.deno?.version)} />
        <EngineLine
          icon="cookie"
          name={t('engine.cookies')}
          value={t(`settings.access.browsers.${cookiesBrowser}`)}
        />
      </section>
    </aside>
  )
}
