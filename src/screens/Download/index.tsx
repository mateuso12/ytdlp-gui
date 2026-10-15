import { useTranslation } from 'react-i18next'
import styles from './Download.module.css'
import { ProbeView } from './ProbeView'

export function DownloadScreen() {
  const { t } = useTranslation()
  return (
    <section>
      <h1 className={styles.srTitle}>{t('screens.download.title')}</h1>
      <ProbeView />
    </section>
  )
}
