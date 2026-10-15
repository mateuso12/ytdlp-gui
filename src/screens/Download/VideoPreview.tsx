import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../../components/Icon'
import { bestAudio, codecLabel, topVideoLabel } from '../../core/formats'
import { formatTimecode } from '../../core/timecode'
import type { VideoInfo } from '../../core/types'
import styles from './VideoPreview.module.css'

interface VideoPreviewProps {
  video: VideoInfo
  /** The section chosen in the panel; shown as a pill when set. */
  section?: { start: string; end: string } | null
}

/** `20141110` (yt-dlp's upload_date) as a date in the language of the app. */
function formatUploadDate(raw: string | null, locale: string): string | null {
  const m = raw === null ? null : /^(\d{4})(\d{2})(\d{2})$/.exec(raw)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function Pill({ icon, testId, children }: { icon: IconName; testId?: string; children: string }) {
  return (
    <span className={styles.pill} data-testid={testId}>
      <Icon name={icon} size={16} />
      {children}
    </span>
  )
}

/** The left column of the Download screen: thumbnail, title, channel and what the video offers. */
export function VideoPreview({ video, section }: VideoPreviewProps) {
  const { t, i18n } = useTranslation()
  // Thumbnails are remote (YouTube's CDN): a broken one gets a quiet placeholder, not a broken icon.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = video.thumbnail !== null && failedUrl !== video.thumbnail

  const topVideo = topVideoLabel(video.formats)
  const audio = bestAudio(video.formats)
  const audioLabel = audio
    ? [codecLabel(audio.acodec), audio.abr === null ? '' : `${Math.round(audio.abr)}k`]
        .filter(Boolean)
        .join(' ')
    : ''
  const published = formatUploadDate(video.uploadDate, i18n.language)

  return (
    <div className={styles.preview}>
      <div className={styles.thumb}>
        {showImage ? (
          <img
            className={styles.image}
            src={video.thumbnail ?? undefined}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(video.thumbnail)}
          />
        ) : (
          <div className={styles.placeholder} data-testid="thumb-placeholder" />
        )}
        {video.duration !== null ? (
          <span className={styles.duration}>{formatTimecode(Math.round(video.duration))}</span>
        ) : null}
      </div>

      <h2 className={styles.title}>{video.title}</h2>

      {video.channel !== null || published !== null ? (
        <div className={styles.channel}>
          {video.channel !== null ? (
            <span className={styles.avatar} aria-hidden="true">
              {video.channel.charAt(0).toLocaleUpperCase(i18n.language)}
            </span>
          ) : null}
          <div>
            {video.channel !== null ? <b className={styles.channelName}>{video.channel}</b> : null}
            {published !== null ? (
              <span className={styles.date}>{t('preview.published', { date: published })}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.pills}>
        {topVideo ? <Pill icon="monitor-play">{topVideo}</Pill> : null}
        {audioLabel ? <Pill icon="audio-lines">{audioLabel}</Pill> : null}
        {section ? (
          <Pill icon="scissors" testId="section-pill">
            {`${section.start} → ${section.end === 'inf' ? t('panel.section.untilEnd') : section.end}`}
          </Pill>
        ) : null}
      </div>
    </div>
  )
}
