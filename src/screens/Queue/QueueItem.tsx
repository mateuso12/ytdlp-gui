import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import { Icon } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import { useToast } from '../../components/Toast'
import { formatBytes, formatEta, formatSpeed } from '../../core/format'
import type { FriendlyError } from '../../core/types'
import { useDeps } from '../../stores/deps'
import { useQueue, type Job } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { ErrorDetails } from './ErrorDetails'
import styles from './Queue.module.css'
import { ProgressBar } from './ProgressBar'

type ErrorAction = NonNullable<FriendlyError['action']>

/** Errors whose fix changes the command: the user may have applied it by hand, so retry rebuilds. */
const REBUILD_ACTIONS: readonly ErrorAction[] = [
  'use_cookies',
  'set_proxy',
  'use_firefox',
  'choose_folder',
  'reinstall_ffmpeg',
]

function Progress({ job }: { job: Job }) {
  const { t, i18n } = useTranslation()
  const progress = job.progress
  const phase = job.phase ?? 'downloading'
  const downloading = phase === 'downloading'
  // `null` progress is "unknown" (a section download reports none), never 0%. So is the
  // merge/post-processing phase: its numbers belong to the download that already ended.
  const percent = downloading && progress?.percent != null ? Math.round(progress.percent) : null
  const phaseText =
    downloading && job.args.includes('--download-sections')
      ? t('queue.phase.section')
      : t(`queue.phase.${phase}`)
  const stats = downloading ? progress : null

  return (
    <>
      <ProgressBar label={job.title} percent={percent} unknownText={phaseText} />
      <div className={styles.meta}>
        <span className={styles.phase}>{phaseText}</span>
        {percent !== null ? <span>{`${percent}%`}</span> : null}
        {stats?.speed != null ? <span>{formatSpeed(stats.speed, i18n.language)}</span> : null}
        {stats?.eta != null ? <span>{formatEta(stats.eta)}</span> : null}
        {stats?.downloadedBytes != null && stats.totalBytes != null ? (
          <span>
            {`${formatBytes(stats.downloadedBytes, i18n.language)} / ${formatBytes(stats.totalBytes, i18n.language)}`}
          </span>
        ) : null}
      </div>
    </>
  )
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={styles.thumb}>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : null}
    </div>
  )
}

/** One queue row. It selects its own job, so a progress line re-renders only this row. */
export const QueueItem = memo(function QueueItem({ id }: { id: string }) {
  const { t } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()
  const job = useQueue((s) => s.jobs.find((j) => j.id === id))
  const [busy, setBusy] = useState(false)

  if (!job) return null

  const retry = () => useQueue.getState().retry(id)
  // These fixes change the command, so the retry must build it again (a plain retry keeps the old args).
  const retryRebuilt = () => useQueue.getState().retryRebuilt(id)

  const attempt = async (work: () => Promise<void> | void) => {
    setBusy(true)
    try {
      await work()
    } catch (error) {
      toast.show(
        t('queue.actionFailed', { reason: error instanceof Error ? error.message : String(error) }),
      )
    } finally {
      setBusy(false)
    }
  }

  const runAction = (action: ErrorAction) =>
    attempt(async () => {
      const settings = useSettings.getState()
      switch (action) {
        case 'use_cookies':
          useUi.getState().go('settings', { section: 'access' })
          break
        case 'set_proxy':
          useUi.getState().go('settings', { section: 'network' })
          break
        case 'update_ytdlp': {
          const version = await bridge.deps.update(settings.settings.channel)
          void useDeps.getState().refresh(bridge)
          toast.show(t('queue.updated', { version }))
          break
        }
        case 'retry':
        case 'retry_later':
          retry()
          break
        case 'reinstall_ffmpeg':
          await bridge.deps.install('ffmpeg')
          await useDeps.getState().refresh(bridge)
          retryRebuilt()
          break
        case 'use_firefox':
          settings.update({ cookiesBrowser: 'firefox' })
          retryRebuilt()
          break
        case 'choose_folder': {
          const dir = await bridge.os.pickFolder()
          if (dir) {
            settings.update({ outputDir: dir })
            retryRebuilt()
          }
          break
        }
      }
    })

  const { status, error } = job
  const action = error?.action
  // "retry" actions are the retry button already; the other errors get the generic one.
  const genericRetry = status !== 'error' || (action !== 'retry' && action !== 'retry_later')
  const canRetry = status === 'error' || status === 'cancelled' || status === 'interrupted'
  const path = job.filePath
  // After fixing cookies/proxy/folder in Settings, a plain retry would replay the old command.
  const rebuildOnRetry =
    status === 'error' && action !== undefined && REBUILD_ACTIONS.includes(action)

  return (
    <li className={styles.row} data-status={status}>
      <Thumb src={job.thumbnail} />
      <div className={styles.body}>
        <div className={styles.title} title={job.title}>
          {job.title}
        </div>
        {status === 'active' ? (
          <Progress job={job} />
        ) : status === 'error' && error ? (
          <div className={styles.error}>
            <div className={styles.errorTitle}>
              <Icon name="alert-circle" size={16} />
              {t(error.titleKey)}
            </div>
            <p className={styles.errorMessage}>{t(error.messageKey)}</p>
            <ErrorDetails args={job.args} stderrTail={job.stderrTail} />
          </div>
        ) : (
          <div className={styles.meta}>
            <span className={status === 'done' ? styles.ok : undefined}>
              {t(`queue.status.${status}`)}
            </span>
          </div>
        )}
      </div>
      <div className={styles.actions}>
        {status === 'error' && action ? (
          <PillButton variant="primary" disabled={busy} onClick={() => void runAction(action)}>
            {t(`queue.action.${action}`)}
          </PillButton>
        ) : null}
        {canRetry && genericRetry ? (
          <PillButton
            variant="ghost"
            icon="rotate-ccw"
            onClick={rebuildOnRetry ? retryRebuilt : retry}
          >
            {t('queue.retry')}
          </PillButton>
        ) : null}
        {status === 'done' && path ? (
          <>
            <PillButton
              variant="ghost"
              icon="external-link"
              onClick={() => void attempt(() => bridge.os.openPath(path))}
            >
              {t('queue.open')}
            </PillButton>
            <PillButton
              variant="ghost"
              icon="folder-open"
              onClick={() => void attempt(() => bridge.os.revealPath(path))}
            >
              {t('queue.reveal')}
            </PillButton>
          </>
        ) : null}
        {status === 'queued' || status === 'active' ? (
          <PillButton variant="ghost" icon="x" onClick={() => useQueue.getState().cancel(id)}>
            {t('queue.cancel')}
          </PillButton>
        ) : (
          <PillButton variant="ghost" icon="trash-2" onClick={() => useQueue.getState().remove(id)}>
            {t('queue.remove')}
          </PillButton>
        )}
      </div>
    </li>
  )
})
