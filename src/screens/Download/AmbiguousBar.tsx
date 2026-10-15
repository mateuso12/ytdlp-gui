import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import { Segmented } from '../../components/Segmented'
import styles from './AmbiguousBar.module.css'
import type { AmbiguousInfo } from './useProbe'

interface AmbiguousBarProps {
  info: AmbiguousInfo
  onChoose(which: 'video' | 'playlist'): void
}

/** "This link is a video inside a playlist": pick `--no-playlist` or the whole playlist (spec 2.1). */
export function AmbiguousBar({ info, onChoose }: AmbiguousBarProps) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar}>
      <span className={styles.message}>
        <Icon name="list-video" size={18} />
        {t('probe.ambiguous.message')}
      </span>
      <Segmented
        value={info.choice}
        onChange={onChoose}
        options={[
          { value: 'video', label: t('probe.ambiguous.video') },
          { value: 'playlist', label: t('probe.ambiguous.playlist', { n: info.playlistCount }) },
        ]}
      />
    </div>
  )
}
