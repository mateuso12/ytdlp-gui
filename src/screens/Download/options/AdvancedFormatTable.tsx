import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { audioTracks, codecLabel, videoTracks } from '../../../core/formats'
import type { Format } from '../../../core/types'
import { formatBytes } from '../../../core/units'
import styles from './AdvancedFormatTable.module.css'

export interface AdvancedChoice {
  videoFormatId: string | null
  audioFormatId: string | null
}

interface AdvancedFormatTableProps {
  formats: Format[]
  value: AdvancedChoice
  onChange(next: AdvancedChoice): void
}

const DASH = '—'

/** The first picks for "Avançado": the best video and the best audio. */
export function defaultAdvancedChoice(formats: Format[]): AdvancedChoice {
  return {
    videoFormatId: videoTracks(formats)[0]?.id ?? null,
    audioFormatId: audioTracks(formats)[0]?.id ?? null,
  }
}

/**
 * The real formats of the video, split into video and audio tracks, to pick one of each
 * (spec 2.1 "Avançado"). Each row is a radio; a click anywhere on the row picks it.
 */
export function AdvancedFormatTable({ formats, value, onChange }: AdvancedFormatTableProps) {
  const { t, i18n } = useTranslation()
  const videoId = useId()
  const audioId = useId()
  const size = (f: Format) => (f.filesize === null ? DASH : formatBytes(f.filesize, i18n.language))

  const video = videoTracks(formats)
  const audio = audioTracks(formats)

  return (
    <div className={styles.root}>
      <h3 id={videoId} className={styles.heading}>
        {t('panel.advanced.videoTracks')}
      </h3>
      <div className={styles.scroll}>
        <table className={styles.table} aria-labelledby={videoId}>
          <thead>
            <tr>
              <th scope="col" className={styles.select}>
                <span className={styles.srOnly}>{t('panel.advanced.select')}</span>
              </th>
              <th scope="col">{t('panel.advanced.id')}</th>
              <th scope="col">{t('panel.advanced.resolution')}</th>
              <th scope="col">{t('panel.advanced.fps')}</th>
              <th scope="col">{t('panel.advanced.codec')}</th>
              <th scope="col" className={styles.num}>
                {t('panel.advanced.size')}
              </th>
            </tr>
          </thead>
          <tbody>
            {video.map((f) => {
              const resolution = f.height === null ? DASH : `${f.height}p`
              const fps = f.fps === null ? DASH : String(Math.round(f.fps))
              const checked = value.videoFormatId === f.id
              return (
                <tr
                  key={f.id}
                  data-checked={checked}
                  onClick={() => onChange({ ...value, videoFormatId: f.id })}
                >
                  <td className={styles.select}>
                    <input
                      type="radio"
                      name={videoId}
                      checked={checked}
                      aria-label={`${f.id}: ${resolution}${f.fps !== null && f.fps > 30 ? fps : ''} ${codecLabel(f.vcodec)}`}
                      onChange={() => onChange({ ...value, videoFormatId: f.id })}
                    />
                  </td>
                  <td className={styles.mono}>{f.id}</td>
                  <td>{resolution}</td>
                  <td>{fps}</td>
                  <td>{codecLabel(f.vcodec)}</td>
                  <td className={styles.num}>{size(f)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3 id={audioId} className={styles.heading}>
        {t('panel.advanced.audioTracks')}
      </h3>
      <div className={styles.scroll}>
        <table className={styles.table} aria-labelledby={audioId}>
          <thead>
            <tr>
              <th scope="col" className={styles.select}>
                <span className={styles.srOnly}>{t('panel.advanced.select')}</span>
              </th>
              <th scope="col">{t('panel.advanced.id')}</th>
              <th scope="col">{t('panel.advanced.codec')}</th>
              <th scope="col">{t('panel.advanced.bitrate')}</th>
              <th scope="col" className={styles.num}>
                {t('panel.advanced.size')}
              </th>
            </tr>
          </thead>
          <tbody>
            {audio.map((f) => {
              const bitrate = f.abr === null ? DASH : `${Math.round(f.abr)} kbps`
              const checked = value.audioFormatId === f.id
              return (
                <tr
                  key={f.id}
                  data-checked={checked}
                  onClick={() => onChange({ ...value, audioFormatId: f.id })}
                >
                  <td className={styles.select}>
                    <input
                      type="radio"
                      name={audioId}
                      checked={checked}
                      aria-label={`${f.id}: ${codecLabel(f.acodec)} ${bitrate}`}
                      onChange={() => onChange({ ...value, audioFormatId: f.id })}
                    />
                  </td>
                  <td className={styles.mono}>{f.id}</td>
                  <td>{codecLabel(f.acodec)}</td>
                  <td>{bitrate}</td>
                  <td className={styles.num}>{size(f)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
