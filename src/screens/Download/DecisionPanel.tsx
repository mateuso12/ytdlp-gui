import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip } from '../../components/Chip'
import { Icon, type IconName } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import { Switch } from '../../components/Switch'
import { advancedOutputExt, canEmbedThumbnail } from '../../core/compat'
import { swapExtension } from '../../core/formats'
import { parseSection } from '../../core/timecode'
import type { DownloadOptions, VideoInfo } from '../../core/types'
import { formatBytes } from '../../core/units'
import { useSettings } from '../../stores/settings'
import styles from './DecisionPanel.module.css'
import {
  AdvancedFormatTable,
  defaultAdvancedChoice,
  type AdvancedChoice,
} from './options/AdvancedFormatTable'
import { PlainRow, RowLabel } from './options/OptionRow'
import { NO_SECTION_TEXT, SectionRow, type SectionText } from './options/SectionPopover'
import {
  DEFAULT_SPONSOR_BLOCK,
  SponsorBlockRow,
  type SponsorBlockState,
} from './options/SponsorBlockPopover'
import { NO_SUBTITLES, SubtitlesRow, type SubtitlesState } from './options/SubtitlesPopover'
import {
  FALLBACK_QUALITY_OPTIONS,
  resolveQuality,
  visibleQualityOptions,
  type QualityHeight,
} from './qualityOptions'

type Mode = DownloadOptions['mode']
type Container = NonNullable<DownloadOptions['video']>['container']
type AudioFormat = NonNullable<DownloadOptions['audio']>['format']
type AudioQuality = NonNullable<DownloadOptions['audio']>['quality']

const CONTAINERS: { value: Container; label: string }[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'webm', label: 'WebM' },
]

const AUDIO_FORMATS: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'opus', label: 'Opus' },
  { value: 'flac', label: 'FLAC' },
]

const AUDIO_QUALITIES: AudioQuality[] = [0, 2, 5]

const MODE_ICONS: Record<Mode, IconName> = {
  video: 'clapperboard',
  audio: 'music-2',
  advanced: 'sliders-horizontal',
}

export interface DecisionPanelProps {
  /** The probed video. Without it (a playlist's shared options) heights come without sizes. */
  video?: VideoInfo
  /** Hides "Avançado" and the file name: per-item formats do not apply to a list of videos. */
  compact?: boolean
  onDownload(opts: DownloadOptions): void
  /**
   * Starts from these choices instead of the Settings defaults (a playlist keeps its shared
   * options across opening and closing the panel).
   */
  initialOptions?: DownloadOptions
  /** Called with the built options whenever the user changes a choice (not on first render). */
  onOptionsChange?(opts: DownloadOptions): void
  /** Reports the section that is set (`null` while there is none or it is invalid). */
  onSectionChange?(section: { start: string; end: string } | null): void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className={styles.label}>
        {label}
      </p>
      <div className={styles.chips}>{children}</div>
    </div>
  )
}

/**
 * The right-hand panel of the Download screen: what to download as, quality and format, the
 * background options, and the destination with the "Baixar" button (spec 2.1, mockup v3).
 * It starts from the defaults in the Settings and hands the chosen options to `onDownload`.
 */
export function DecisionPanel({
  video,
  compact = false,
  onDownload,
  initialOptions,
  onOptionsChange,
  onSectionChange,
}: DecisionPanelProps) {
  const { t, i18n } = useTranslation()
  const outputDir = useSettings((s) => s.settings.outputDir)
  const formats = video?.formats ?? []

  // The defaults are read once, when the panel appears: later changes in Settings apply to the
  // next video, not to a choice the user is in the middle of.
  const [initial] = useState(() => useSettings.getState().settings.defaults)
  const [seed] = useState(() => initialOptions)
  const start = seed ?? initial
  const [mode, setMode] = useState<Mode>(
    compact && start.mode === 'advanced' ? 'video' : start.mode,
  )
  const [preferredHeight, setPreferredHeight] = useState<QualityHeight>(
    start.video?.maxHeight ?? 'best',
  )
  const [container, setContainer] = useState<Container>(start.video?.container ?? 'mp4')
  const [audioFormat, setAudioFormat] = useState<AudioFormat>(start.audio?.format ?? 'mp3')
  const [audioQuality, setAudioQuality] = useState<AudioQuality>(start.audio?.quality ?? 0)
  const [advanced, setAdvanced] = useState<AdvancedChoice>(() => defaultAdvancedChoice(formats))
  const [subtitles, setSubtitles] = useState<SubtitlesState>(seed?.subtitles ?? NO_SUBTITLES)
  const [sponsor, setSponsor] = useState<SponsorBlockState>(
    seed?.sponsorBlock ? { enabled: true, ...seed.sponsorBlock } : DEFAULT_SPONSOR_BLOCK,
  )
  const [embed, setEmbed] = useState(seed?.embedMetadata ?? true)
  const [sectionText, setSectionText] = useState<SectionText>(seed?.section ?? NO_SECTION_TEXT)

  const qualityOptions = video ? visibleQualityOptions(formats) : FALLBACK_QUALITY_OPTIONS
  const height = resolveQuality(preferredHeight, qualityOptions)
  const section = parseSection(sectionText.start, sectionText.end, video?.duration)

  const sectionKey =
    section.ok && section.section ? `${section.section.start}|${section.section.end}` : ''
  useEffect(() => {
    if (!onSectionChange) return
    const [start, end] = sectionKey.split('|')
    onSectionChange(sectionKey ? { start, end } : null)
  }, [sectionKey, onSectionChange])

  // The file a download will produce decides whether a cover can go into it (yt-dlp fails the job
  // after the download otherwise), so the panel never asks for one that cannot be embedded.
  const output =
    mode === 'video'
      ? container
      : mode === 'audio'
        ? audioFormat
        : advancedOutputExt(
            formats.find((f) => f.id === advanced.videoFormatId)?.ext ?? null,
            formats.find((f) => f.id === advanced.audioFormatId)?.ext ?? null,
          )
  const thumbnailFits = canEmbedThumbnail(output)

  const buildOptions = (): DownloadOptions => {
    const opts: DownloadOptions = {
      mode,
      embedThumbnail: embed && thumbnailFits,
      embedMetadata: embed,
      embedChapters: embed,
    }
    if (mode === 'video') opts.video = { maxHeight: height, container }
    if (mode === 'audio') opts.audio = { format: audioFormat, quality: audioQuality }
    if (mode === 'advanced') opts.advanced = advanced
    if (subtitles.langs.length > 0) opts.subtitles = subtitles
    if (sponsor.enabled && sponsor.categories.length > 0) {
      opts.sponsorBlock = { action: sponsor.action, categories: sponsor.categories }
    }
    if (section.ok && section.section) opts.section = section.section
    return opts
  }

  const optionsKey = JSON.stringify(buildOptions())
  // Notify only when the options differ from the last ones known (initially the starting ones), so
  // a re-run of the effect (StrictMode) or a re-render never reports a change nobody made.
  const known = useRef(optionsKey)
  useEffect(() => {
    if (optionsKey === known.current) return
    known.current = optionsKey
    onOptionsChange?.(JSON.parse(optionsKey) as DownloadOptions)
  }, [optionsKey, onOptionsChange])

  const modes: Mode[] = compact ? ['video', 'audio'] : ['video', 'audio', 'advanced']
  const extension = mode === 'video' ? container : mode === 'audio' ? audioFormat : null
  const probedName = !compact ? video?.filename : null
  const path = probedName
    ? extension
      ? swapExtension(probedName, extension)
      : probedName
    : outputDir

  return (
    <section className={styles.panel} aria-label={t('panel.label')}>
      <Field label={t('panel.mode.label')}>
        {modes.map((m) => (
          <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
            <Icon name={MODE_ICONS[m]} size={16} />
            {t(`panel.mode.${m}`)}
          </Chip>
        ))}
      </Field>

      {mode === 'video' ? (
        <>
          <Field label={t('panel.quality.label')}>
            {qualityOptions.map((option) => (
              <Chip
                key={option.height}
                selected={height === option.height}
                onClick={() => setPreferredHeight(option.height)}
                hint={
                  option.sizeBytes === null
                    ? undefined
                    : `~${formatBytes(option.sizeBytes, i18n.language)}`
                }
              >
                {option.height === 'best' ? t('panel.quality.best') : option.label}
              </Chip>
            ))}
          </Field>
          <Field label={t('panel.container.label')}>
            {CONTAINERS.map((c) => (
              <Chip
                key={c.value}
                selected={container === c.value}
                onClick={() => setContainer(c.value)}
              >
                {c.label}
              </Chip>
            ))}
          </Field>
        </>
      ) : null}

      {mode === 'audio' ? (
        <>
          <Field label={t('panel.audio.format')}>
            {AUDIO_FORMATS.map((f) => (
              <Chip
                key={f.value}
                selected={audioFormat === f.value}
                onClick={() => setAudioFormat(f.value)}
              >
                {f.label}
              </Chip>
            ))}
          </Field>
          {audioFormat !== 'flac' ? (
            <Field label={t('panel.audio.quality')}>
              {AUDIO_QUALITIES.map((q) => (
                <Chip key={q} selected={audioQuality === q} onClick={() => setAudioQuality(q)}>
                  {t(`panel.audio.q${q}`)}
                </Chip>
              ))}
            </Field>
          ) : null}
        </>
      ) : null}

      {mode === 'advanced' ? (
        <AdvancedFormatTable formats={formats} value={advanced} onChange={setAdvanced} />
      ) : null}

      <div className={styles.options}>
        <SubtitlesRow video={video} value={subtitles} onChange={setSubtitles} />
        <SponsorBlockRow value={sponsor} onChange={setSponsor} />
        <PlainRow>
          <Switch
            fill
            label={<RowLabel icon="image">{t('panel.embed.label')}</RowLabel>}
            checked={embed}
            onCheckedChange={setEmbed}
          />
        </PlainRow>
        {embed && !thumbnailFits ? (
          <p className={styles.hint}>
            {t('panel.embed.noThumbnail', {
              format: output === 'webm' ? 'WebM' : output?.toUpperCase(),
            })}
          </p>
        ) : null}
        <SectionRow value={sectionText} result={section} onChange={setSectionText} />
      </div>

      <div className={styles.footer}>
        <span className={styles.path} title={path}>
          <Icon name="folder" size={16} />
          <span className={styles.pathText}>{path}</span>
        </span>
        <PillButton
          variant="primary"
          icon="download"
          disabled={!section.ok}
          onClick={() => onDownload(buildOptions())}
        >
          {t('panel.download')}
        </PillButton>
      </div>
    </section>
  )
}
