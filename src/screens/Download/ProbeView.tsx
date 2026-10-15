import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip } from '../../components/Chip'
import { Icon } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import type { PlaylistInfo, VideoInfo } from '../../core/types'
import { useQueue } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { AmbiguousBar } from './AmbiguousBar'
import { defaultDownloadOptions } from './defaultOptions'
import styles from './ProbeView.module.css'
import { URL_ERROR_ID } from './UrlField'
import { useProbe } from './useProbe'

/**
 * Task 15 replaces this with the thumbnail, details and `DecisionPanel`. Until then it shows the
 * title and the "Vídeo" mode chip.
 */
function VideoPlaceholder({ video }: { video: VideoInfo }) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className={styles.title}>{video.title}</h2>
      <Chip selected onClick={() => undefined}>
        {t('probe.videoMode')}
      </Chip>
    </div>
  )
}

/** Task 16 replaces this with the selectable, virtualised `PlaylistView`. */
function PlaylistPlaceholder({ playlist }: { playlist: PlaylistInfo }) {
  const { t } = useTranslation()
  const n = playlist.entries.length
  return (
    <div>
      <h2 className={styles.title}>{playlist.title}</h2>
      <p className={styles.meta}>{t(n === 1 ? 'probe.itemsOne' : 'probe.itemsOther', { n })}</p>
    </div>
  )
}

function Detected({ icon, children }: { icon: 'video' | 'list-video'; children: ReactNode }) {
  return (
    <p className={styles.detected}>
      <Icon name={icon} size={16} />
      {children}
    </p>
  )
}

/**
 * The part of the Download screen that follows the probe state. It is the switch that hosts the
 * video preview (Task 15) and the playlist view (Task 16).
 */
export function ProbeView() {
  const { t } = useTranslation()
  const { state, choose, reset } = useProbe()
  const go = useUi((s) => s.go)

  if (state.status === 'idle') return <p className={styles.hint}>{t('probe.idle')}</p>

  if (state.status === 'multi') {
    // No probe per link: the URL stands in for the title and there is no video id yet, so the
    // history's "already downloaded" check cannot match these. The job still downloads normally.
    const confirm = () => {
      const opts = defaultDownloadOptions(useSettings.getState().settings)
      useQueue.getState().enqueue(
        state.urls.map((url) => ({
          url,
          title: url,
          thumbnail: null,
          extractor: 'generic',
          videoId: '',
          opts,
        })),
      )
      reset()
      go('queue')
    }
    return (
      <div>
        <Detected icon="list-video">{t('probe.multi.count', { n: state.count })}</Detected>
        <p className={styles.meta}>{t('probe.multi.hint')}</p>
        <PillButton variant="primary" onClick={confirm}>
          {t('probe.multi.confirm', { n: state.count })}
        </PillButton>
      </div>
    )
  }

  const bar = state.ambiguous ? <AmbiguousBar info={state.ambiguous} onChoose={choose} /> : null

  if (state.status === 'loading') {
    return (
      <div>
        {bar}
        <div role="status" className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          {t('probe.loading')}
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    const { error } = state
    return (
      <div>
        {bar}
        <div role="alert" id={URL_ERROR_ID} className={styles.error}>
          <strong className={styles.errorTitle}>{t(error.titleKey)}</strong>
          <p className={styles.errorMessage}>{t(error.messageKey)}</p>
          {error.lastLine ? <code className={styles.errorDetail}>{error.lastLine}</code> : null}
        </div>
      </div>
    )
  }

  const { probe } = state
  return (
    <div>
      {bar}
      {probe.kind === 'video' ? (
        <>
          <Detected icon="video">{t('probe.video')}</Detected>
          <VideoPlaceholder video={probe.video} />
        </>
      ) : probe.kind === 'playlist' ? (
        <>
          <Detected icon="list-video">{t('probe.playlist')}</Detected>
          <PlaylistPlaceholder playlist={probe.playlist} />
        </>
      ) : null}
    </div>
  )
}
