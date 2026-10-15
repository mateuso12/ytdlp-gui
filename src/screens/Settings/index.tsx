import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUi } from '../../stores/ui'
import { AboutSection } from './AboutSection'
import { AccessSection } from './AccessSection'
import { AppearanceSection } from './AppearanceSection'
import { DownloadsSection } from './DownloadsSection'
import { EngineSection } from './EngineSection'
import { NetworkSection } from './NetworkSection'
import styles from './Settings.module.css'

/** Scrolls to a section and moves focus to its title (an error action asks for this). */
function useArrivalSection() {
  const target = useUi((s) => s.settingsSection)
  useEffect(() => {
    if (!target) return
    const title = document.getElementById(`settings-${target}-title`)
    if (title) {
      if (typeof title.scrollIntoView === 'function') title.scrollIntoView({ block: 'start' })
      title.focus({ preventScroll: true })
    }
    useUi.getState().clearSettingsSection()
  }, [target])
}

export function SettingsScreen() {
  const { t } = useTranslation()
  useArrivalSection()
  return (
    <section className={styles.screen}>
      <h1 className={styles.heading}>{t('screens.settings.title')}</h1>
      <DownloadsSection />
      <NetworkSection />
      <AccessSection />
      <AppearanceSection />
      <EngineSection />
      <AboutSection />
    </section>
  )
}
