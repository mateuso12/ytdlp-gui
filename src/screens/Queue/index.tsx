import { useTranslation } from 'react-i18next'

export function QueueScreen() {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t('screens.queue.title')}</h1>
    </section>
  )
}
