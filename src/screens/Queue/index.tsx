import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { PillButton } from '../../components/PillButton'
import { useQueue } from '../../stores/queue'
import styles from './Queue.module.css'
import { QueueItem } from './QueueItem'

const FINISHED = ['done', 'error', 'cancelled']

export function QueueScreen() {
  const { t } = useTranslation()
  // Ids only: a progress line changes a job, not this list, so only its row re-renders.
  const ids = useQueue(useShallow((s) => s.jobs.map((j) => j.id)))
  const hasFinished = useQueue((s) => s.jobs.some((j) => FINISHED.includes(j.status)))
  const clearFinished = useQueue((s) => s.clearFinished)

  return (
    <section className={styles.screen}>
      <div className={styles.head}>
        <h1 className={styles.heading}>{t('screens.queue.title')}</h1>
        {hasFinished ? (
          <PillButton variant="ghost" onClick={clearFinished}>
            {t('queue.clear')}
          </PillButton>
        ) : null}
      </div>
      {ids.length === 0 ? (
        <p className={styles.empty}>{t('queue.empty')}</p>
      ) : (
        <ul className={styles.list} aria-label={t('queue.list')}>
          {ids.map((id) => (
            <QueueItem key={id} id={id} />
          ))}
        </ul>
      )}
    </section>
  )
}
