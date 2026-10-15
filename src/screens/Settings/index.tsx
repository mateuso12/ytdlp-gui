import { useTranslation } from 'react-i18next'

export function SettingsScreen() {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('screens.settings.title')}</h1>
    </section>
  )
}
