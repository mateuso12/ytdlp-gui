import { useTranslation } from 'react-i18next'

export function HistoryScreen() {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('screens.history.title')}</h1>
    </section>
  )
}
