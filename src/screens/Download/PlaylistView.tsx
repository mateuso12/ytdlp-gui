import * as Popover from '@radix-ui/react-popover'
import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useCallback, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Chip } from '../../components/Chip'
import chipStyles from '../../components/Chip.module.css'
import { Icon } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import { useToast } from '../../components/Toast'
import { formatTimecode } from '../../core/timecode'
import type { DownloadOptions, PlaylistEntry, PlaylistInfo } from '../../core/types'
import { formatBytes } from '../../core/units'
import { useHistory } from '../../stores/history'
import { useQueue, type QueueInput } from '../../stores/queue'
import { useSettings } from '../../stores/settings'
import { useUi } from '../../stores/ui'
import { DecisionPanel } from './DecisionPanel'
import { defaultDownloadOptions } from './defaultOptions'
import optionStyles from './options/options.module.css'
import styles from './PlaylistView.module.css'
import {
  entryExtractor,
  formatTotalDuration,
  initialSelection,
  isSelectable,
  parseRange,
} from './selection'
import { useProbe } from './useProbe'

/** "Só áudio · MP3" / "1080p · MP4": the shared choice, in a few words. */
function summaryOf(opts: DownloadOptions, t: TFunction): string {
  if (opts.mode === 'audio') {
    return [t('panel.mode.audio'), (opts.audio?.format ?? 'mp3').toUpperCase()].join(' · ')
  }
  const video = opts.video
  const quality =
    !video || video.maxHeight === 'best'
      ? t('panel.quality.best')
      : video.maxHeight === 2160
        ? '4K'
        : `${video.maxHeight}p`
  const container = video?.container === 'webm' ? 'WebM' : (video?.container ?? 'mp4').toUpperCase()
  return `${quality} · ${container}`
}

/** One row: 8px of padding around a 140px thumbnail (16:9, 79px high). */
const ROW_HEIGHT = 96

/** Whether the playlist-level options say the same as the defaults (nothing to point out). */
function sameAsDefaults(opts: DownloadOptions, defaults: DownloadOptions): boolean {
  const pick = (o: DownloadOptions) =>
    JSON.stringify([
      o.mode,
      o.mode === 'video' ? o.video : null,
      o.mode === 'audio' ? o.audio : null,
      o.embedThumbnail,
      o.embedMetadata,
      o.embedChapters,
      o.subtitles ?? null,
      o.sponsorBlock ?? null,
      o.section ?? null,
    ])
  return pick(opts) === pick(defaults)
}

interface RowProps {
  /** Position in the playlist, from 1. */
  index: number
  entry: PlaylistEntry
  channel: string | null
  checked: boolean
  downloaded: boolean
  top: number
  onToggle(index: number): void
}

const Row = memo(function Row({
  index,
  entry,
  channel,
  checked,
  downloaded,
  top,
  onToggle,
}: RowProps) {
  const { t, i18n } = useTranslation()
  const [failed, setFailed] = useState(false)
  const selectable = isSelectable(entry)
  // Whatever yt-dlp put in place of a title (nothing, "[Private video]") is no title to show.
  const title = selectable ? (entry.title ?? entry.url) : t('playlist.row.unavailable')
  const sub = !selectable ? null : downloaded ? t('playlist.row.downloaded') : channel

  return (
    <div
      role="row"
      aria-rowindex={index}
      aria-selected={checked}
      className={styles.row}
      data-dim={downloaded || !selectable}
      data-disabled={!selectable}
      style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
      onClick={(e) => {
        // The checkbox handles its own clicks; this makes the rest of the row a bigger target.
        if (selectable && !(e.target as HTMLElement).closest('input')) onToggle(index)
      }}
    >
      <span role="gridcell" className={styles.index}>
        {index}
      </span>
      <span role="gridcell" className={styles.check}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!selectable}
          aria-label={t('playlist.row.select', { title })}
          onChange={() => onToggle(index)}
        />
        <Icon name="check" size={16} />
      </span>
      <span role="gridcell" className={styles.thumb}>
        {entry.thumbnail !== null && !failed ? (
          <img
            src={entry.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : null}
        {entry.duration !== null ? (
          <span className={styles.duration}>{formatTimecode(Math.round(entry.duration))}</span>
        ) : null}
      </span>
      <span role="gridcell" className={styles.text}>
        <span className={styles.title} title={title}>
          {title}
        </span>
        {sub ? <span className={styles.sub}>{sub}</span> : null}
      </span>
      <span role="gridcell" className={styles.size}>
        {downloaded ? (
          <span data-testid="downloaded-icon">
            <Icon name="check-circle-2" size={16} />
          </span>
        ) : entry.sizeBytes !== undefined ? (
          `~${formatBytes(entry.sizeBytes, i18n.language)}`
        ) : null}
      </span>
    </div>
  )
})

/** "Intervalo…": a box for `1-3, 7, 10-`, checked when it is applied. */
function RangeShortcut({ max, onApply }: { max: number; onApply(positions: Set<number>): void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = parseRange(text, max)
    if (result instanceof Error) {
      setError(result.message)
      return
    }
    onApply(result)
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" className={chipStyles.chip}>
          {t('playlist.shortcuts.range')}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={optionStyles.popover}
          aria-label={t('playlist.range.label')}
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={16}
        >
          <form onSubmit={submit} noValidate>
            <div className={styles.rangeForm}>
              <input
                type="text"
                className={optionStyles.input}
                value={text}
                placeholder={t('playlist.range.placeholder')}
                aria-label={t('playlist.range.label')}
                aria-invalid={error !== null}
                aria-describedby={error !== null ? errorId : undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setText(e.target.value)
                  setError(null)
                }}
              />
              <PillButton variant="primary" type="submit">
                {t('playlist.range.apply')}
              </PillButton>
            </div>
            {error !== null ? (
              <p role="alert" id={errorId} className={optionStyles.error}>
                {t(`playlist.range.errors.${error}`, { count: max })}
              </p>
            ) : (
              <p className={`${optionStyles.note} ${styles.rangeNote}`}>
                {t('playlist.range.hint')}
              </p>
            )}
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * A playlist with a header card to start the download from and a list to choose the items from
 * (spec 2.1, mockup v3 "Tela 2"). The list is virtualised: a playlist can hold thousands of items.
 */
export function PlaylistView({ playlist }: { playlist: PlaylistInfo }) {
  const { t, i18n } = useTranslation()
  const { reset } = useProbe()
  const go = useUi((s) => s.go)
  const toast = useToast()
  const historyItems = useHistory((s) => s.items)
  const [optionsOpen, setOptionsOpen] = useState(false)
  // The choices made in the options popover belong to the playlist: closing it keeps them, and
  // "Baixar N" uses them. `null` until the user changes something.
  const [chosen, setChosen] = useState<DownloadOptions | null>(null)
  const defaults = defaultDownloadOptions(useSettings.getState().settings)
  const optionsLabel = chosen && !sameAsDefaults(chosen, defaults) ? summaryOf(chosen, t) : null
  const scrollRef = useRef<HTMLDivElement>(null)
  const headingId = useId()

  const { entries } = playlist
  // The history knows videos by their own extractor name, not the list's (`youtube`, not `youtube:tab`).
  const extractor = entryExtractor(playlist.extractor)
  const knownKeys = useMemo(
    () => new Set(historyItems.map((i) => `${i.extractor}\u0000${i.videoId}`)),
    [historyItems],
  )
  const isDownloaded = (entry: PlaylistEntry) => knownKeys.has(`${extractor}\u0000${entry.id}`)

  // Chosen once, when the playlist appears: finishing a download elsewhere must not untick things.
  const [selected, setSelected] = useState(() => initialSelection(entries, isDownloaded))

  const selectable = useMemo(
    () => entries.flatMap((e, i) => (isSelectable(e) ? [i + 1] : [])),
    [entries],
  )
  const notDownloaded = useMemo(
    () => selectable.filter((i) => !knownKeys.has(`${extractor}\u0000${entries[i - 1].id}`)),
    [selectable, knownKeys, extractor, entries],
  )

  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }, [])

  const count = selected.size
  const picked = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => entries[i - 1]),
    [selected, entries],
  )
  // A total only when every selected item has a size: a partial sum would understate the download.
  const totalBytes =
    picked.length > 0 && picked.every((e) => e.sizeBytes !== undefined)
      ? picked.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0)
      : null
  const summary =
    t('playlist.selected', { count }) +
    (totalBytes === null ? '' : ` · ~${formatBytes(totalBytes, i18n.language)}`)

  const totalSeconds = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0)
  const cover = entries.find((e) => e.thumbnail !== null)?.thumbnail ?? null

  const sameAs = (positions: number[]) =>
    positions.length === selected.size && positions.every((i) => selected.has(i))

  const enqueueSelected = (opts: DownloadOptions) => {
    const inputs: QueueInput[] = picked.filter(isSelectable).map((entry) => ({
      url: entry.url,
      title: entry.title ?? entry.url,
      thumbnail: entry.thumbnail,
      extractor,
      videoId: entry.id,
      opts,
    }))
    if (inputs.length === 0) return
    useQueue.getState().enqueue(inputs)
    // Like a single video: the link is done with, so the screen is ready for the next one.
    reset()
    go('queue')
    toast.show(t('toast.addedToQueue'))
  }

  // The React Compiler is not part of this build, so the library's unmemoizable functions are safe.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  return (
    <div className={styles.host}>
      <div className={styles.layout}>
        <section className={styles.head} aria-labelledby={headingId}>
          <div className={styles.cover}>
            {cover !== null ? (
              <img
                className={styles.coverImage}
                src={cover}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => e.currentTarget.remove()}
              />
            ) : null}
          </div>
          <h2 id={headingId} className={styles.name}>
            {playlist.title}
          </h2>
          <p className={styles.meta}>
            {playlist.channel !== null ? <span>{playlist.channel}</span> : null}
            <span>{t('probe.items', { count: entries.length })}</span>
            {totalSeconds > 0 ? <span>{formatTotalDuration(totalSeconds)}</span> : null}
          </p>
          <p className={styles.summary} data-testid="selection-summary" aria-live="polite">
            {summary}
          </p>
          {optionsLabel !== null ? (
            <p className={styles.optionsSummary} data-testid="options-summary">
              <Icon name="sliders-horizontal" size={16} />
              {optionsLabel}
            </p>
          ) : null}
          <div className={styles.actions}>
            <PillButton
              variant="primary"
              icon="download"
              disabled={count === 0}
              onClick={() => enqueueSelected(chosen ?? defaults)}
            >
              {t('playlist.download', { n: count })}
            </PillButton>
            <Popover.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
              <Popover.Trigger asChild>
                <PillButton variant="ghost" icon="sliders-horizontal" disabled={count === 0}>
                  {t('playlist.options')}
                </PillButton>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className={styles.optionsPopover}
                  aria-label={t('playlist.optionsLabel')}
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  collisionPadding={16}
                >
                  <DecisionPanel
                    compact
                    initialOptions={chosen ?? undefined}
                    onOptionsChange={setChosen}
                    onDownload={(opts) => {
                      setChosen(opts)
                      setOptionsOpen(false)
                      enqueueSelected(opts)
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </section>

        <div>
          <div className={styles.shortcuts} role="group" aria-label={t('playlist.shortcuts.label')}>
            <Chip
              selected={selectable.length > 0 && sameAs(selectable)}
              onClick={() => setSelected(new Set(selectable))}
            >
              {t('playlist.shortcuts.all')}
            </Chip>
            <Chip selected={count === 0} onClick={() => setSelected(new Set())}>
              {t('playlist.shortcuts.none')}
            </Chip>
            <RangeShortcut
              max={entries.length}
              onApply={(positions) =>
                setSelected(new Set(selectable.filter((i) => positions.has(i))))
              }
            />
            <Chip
              selected={
                notDownloaded.length > 0 && sameAs(notDownloaded) && !sameAs(selectable)
              }
              onClick={() => setSelected(new Set(notDownloaded))}
            >
              {t('playlist.shortcuts.notDownloaded')}
            </Chip>
          </div>

          <div
            ref={scrollRef}
            role="grid"
            aria-label={t('playlist.list')}
            aria-rowcount={entries.length}
            aria-multiselectable="true"
            data-testid="playlist-scroll"
            className={styles.scroll}
          >
            <div
              role="rowgroup"
              className={styles.sizer}
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const entry = entries[item.index]
                return (
                  <Row
                    key={item.key}
                    index={item.index + 1}
                    entry={entry}
                    channel={playlist.channel}
                    checked={selected.has(item.index + 1)}
                    downloaded={isDownloaded(entry)}
                    top={item.start}
                    onToggle={toggle}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
