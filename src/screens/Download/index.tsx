import { useTranslation } from 'react-i18next'
import { ProbeView } from './ProbeView'

export function DownloadScreen() {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('screens.download.title')}</h1>
      <ProbeView />
    </section>
  )
}
