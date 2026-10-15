import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import { PillButton } from '../../components/PillButton'
import { useToast } from '../../components/Toast'
import { formatBytes } from '../../core/units'
import type { HistoryItem } from '../../stores/history'
import { useHistory } from '../../stores/history'
import { useQueue } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { defaultDownloadOptions } from '../Download/defaultOptions'
import styles from './History.module.css'

/** One row: 8px of padding around a 140px thumbnail (16:9, 79px high). */
export const ROW_HEIGHT = 96

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={styles.thumb}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  )
}

interface RowProps {
  item: HistoryItem
  /** Position in the list, from 1, and the list's length: for assistive technology. */
  position: number
  total: number
  top: number
  formatDate(ms: number): string
}

const Row = memo(function Row({ item, position, total, top, formatDate }: RowProps) {
  const { t, i18n } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()
  const { path, url } = item

  const attempt = async (work: () => Promise<void>) => {
    try {
      await work()
    } catch (error) {
      toast.show(
        t('history.actionFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  const downloadAgain = (link: string) => {
    useQueue.getState().enqueue([
      {
        url: link,
        title: item.title,
        thumbnail: item.thumbnail,
        extractor: item.extractor,
        videoId: item.videoId,
        opts: defaultDownloadOptions(useSettings.getState().settings),
      },
    ])
    useUi.getState().go('queue')
    toast.show(t('toast.addedToQueue'))
  }

  return (
    <div
      role="listitem"
      aria-posinset={position}
      aria-setsize={total}
      className={styles.row}
      style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
    >
      <Thumb src={item.thumbnail} />
      <div className={styles.body}>
        <div className={styles.title} title={item.title} data-testid="history-title">
          {item.title}
        </div>
        <div className={styles.meta}>
          <span>{formatDate(item.finishedAt)}</span>
          {item.sizeBytes !== null ? (
            <span>{formatBytes(item.sizeBytes, i18n.language)}</span>
          ) : null}
        </div>
      </div>
      <div className={styles.actions}>
        {path ? (
          <>
            <PillButton
              variant="ghost"
              icon="external-link"
              title={t('history.open')}
              onClick={() => void attempt(() => bridge.os.openPath(path))}
            >
              <span className={styles.label}>{t('history.open')}</span>
            </PillButton>
            <PillButton
              variant="ghost"
              icon="folder-open"
              title={t('history.reveal')}
              onClick={() => void attempt(() => bridge.os.revealPath(path))}
            >
              <span className={styles.label}>{t('history.reveal')}</span>
            </PillButton>
          </>
        ) : null}
        {url ? (
          <PillButton
            variant="ghost"
            icon="rotate-ccw"
            title={t('history.redownload')}
            onClick={() => downloadAgain(url)}
          >
            <span className={styles.label}>{t('history.redownload')}</span>
          </PillButton>
        ) : null}
        {/* Only the entry goes: the file stays on disk (spec 2.3). */}
        <PillButton
          variant="ghost"
          icon="trash-2"
          title={t('history.remove')}
          onClick={() => useHistory.getState().remove(item.id)}
        >
          <span className={styles.label}>{t('history.remove')}</span>
        </PillButton>
      </div>
    </div>
  )
})

/** The finished downloads, virtualised: a long-lived history can hold thousands of them. */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  const { t, i18n } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    return (ms: number) => format.format(ms)
  }, [i18n.language])

  // The React Compiler is not part of this build, so the library's unmemoizable functions are safe.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  return (
    <div ref={scrollRef} data-testid="history-scroll" className={styles.scroll}>
      <div
        role="list"
        aria-label={t('history.list')}
        className={styles.sizer}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => (
          <Row
            key={items[v.index].id}
            item={items[v.index]}
            position={v.index + 1}
            total={items.length}
            top={v.start}
            formatDate={formatDate}
          />
        ))}
      </div>
    </div>
  )
}
