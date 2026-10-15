import { useTranslation } from 'react-i18next'
import { useBridge } from '../../bridge/context'
import { Chip } from '../../components/Chip'
import { PillButton } from '../../components/PillButton'
import { Segmented } from '../../components/Segmented'
import { useToast } from '../../components/Toast'
import { previewTemplate } from '../../core/resolveOutputPath'
import type { Settings } from '../../core/types'
import { useSettings } from '../../stores/settings'
import { Row, Section, SelectRow, TextRow, useDraftField } from './parts'
import styles from './Settings.module.css'
import { validateTemplate } from './validate'

/** The sample the name preview is built from (the Big Buck Bunny short). */
const SAMPLE = {
  title: 'Big Buck Bunny 60fps 4K',
  id: 'aqz-KE-bpKQ',
  ext: 'mp4',
  channel: 'Blender',
  uploader: 'Blender',
  upload_date: '20141110',
  height: 2160,
  playlist_index: 1,
}

const EXAMPLES = [
  { key: 'titleId', template: '%(title)s [%(id)s].%(ext)s' },
  { key: 'title', template: '%(title)s.%(ext)s' },
  { key: 'channelTitle', template: '%(channel)s - %(title)s.%(ext)s' },
  { key: 'dateTitle', template: '%(upload_date)s - %(title)s.%(ext)s' },
] as const

const CONCURRENCY = [1, 2, 3, 4, 5, 6]
const HEIGHTS = [2160, 1440, 1080, 720, 480] as const
const heightLabel = (h: number) => (h === 2160 ? '4K' : `${h}p`)

const FALLBACK_VIDEO = { maxHeight: 1080, container: 'mp4' } as const
const FALLBACK_AUDIO = { format: 'mp3', quality: 0 } as const

type Container = 'mp4' | 'mkv' | 'webm'
type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac'
type AudioQuality = '0' | '2' | '5'

const upper = <T extends string>(values: readonly T[]) =>
  values.map((value) => ({ value, label: value.toUpperCase() }))

function NameTemplate() {
  const { t } = useTranslation()
  const template = useSettings((s) => s.settings.outputTemplate)
  const update = useSettings((s) => s.update)
  const field = useDraftField({
    stored: template,
    validate: validateTemplate,
    commit: (outputTemplate) => update({ outputTemplate }),
  })
  // The preview follows what is being typed, as long as it is a usable template.
  const shown = validateTemplate(field.text).ok ? field.text : template

  return (
    <>
      <Row label={t('settings.downloads.template.label')} stack>
        <div
          className={styles.chips}
          role="group"
          aria-label={t('settings.downloads.template.examples')}
        >
          {EXAMPLES.map((example) => (
            <Chip
              key={example.key}
              selected={template === example.template}
              onClick={() => field.pick(example.template)}
            >
              {t(`settings.downloads.template.${example.key}`)}
            </Chip>
          ))}
        </div>
      </Row>
      <TextRow
        label={t('settings.downloads.template.custom')}
        hint={t('settings.downloads.template.hint')}
        value={field.text}
        invalid={field.invalid}
        error={t('settings.downloads.template.errors.empty')}
        mono
        stack
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
      <Row label={t('settings.downloads.template.preview')} stack>
        <output className={styles.preview} aria-label={t('settings.downloads.template.preview')}>
          {previewTemplate(shown, SAMPLE)}
        </output>
      </Row>
    </>
  )
}

function Defaults() {
  const { t } = useTranslation()
  const defaults = useSettings((s) => s.settings.defaults)
  const update = useSettings((s) => s.update)
  const video = defaults.video ?? FALLBACK_VIDEO
  const audio = defaults.audio ?? FALLBACK_AUDIO
  const setDefaults = (patch: Partial<Settings['defaults']>) =>
    update({ defaults: { ...defaults, ...patch } })
  const audioMode = defaults.mode === 'audio'

  return (
    <>
      <Row label={t('settings.downloads.mode')}>
        <Segmented
          label={t('settings.downloads.mode')}
          value={audioMode ? 'audio' : 'video'}
          options={[
            { value: 'video', label: t('panel.mode.video') },
            { value: 'audio', label: t('panel.mode.audio') },
          ]}
          onChange={(mode) => setDefaults({ mode })}
        />
      </Row>
      {audioMode ? (
        <>
          <Row label={t('settings.downloads.audioFormat')}>
            <Segmented<AudioFormat>
              label={t('settings.downloads.audioFormat')}
              value={audio.format}
              options={upper(['mp3', 'm4a', 'opus', 'flac'] as const)}
              onChange={(format) => setDefaults({ audio: { ...audio, format } })}
            />
          </Row>
          <Row label={t('settings.downloads.audioQuality')}>
            <Segmented<AudioQuality>
              label={t('settings.downloads.audioQuality')}
              value={String(audio.quality) as AudioQuality}
              options={[
                { value: '0', label: t('panel.audio.q0') },
                { value: '2', label: t('panel.audio.q2') },
                { value: '5', label: t('panel.audio.q5') },
              ]}
              onChange={(q) =>
                setDefaults({ audio: { ...audio, quality: Number(q) as 0 | 2 | 5 } })
              }
            />
          </Row>
        </>
      ) : (
        <>
          <SelectRow
            label={t('settings.downloads.quality')}
            value={String(video.maxHeight)}
            options={[
              { value: 'best', label: t('panel.quality.best') },
              ...HEIGHTS.map((h) => ({ value: String(h), label: heightLabel(h) })),
            ]}
            onChange={(value) =>
              setDefaults({
                video: { ...video, maxHeight: value === 'best' ? 'best' : Number(value) },
              })
            }
          />
          <Row label={t('settings.downloads.container')}>
            <Segmented<Container>
              label={t('settings.downloads.container')}
              value={video.container}
              options={upper(['mp4', 'mkv', 'webm'] as const)}
              onChange={(container) => setDefaults({ video: { ...video, container } })}
            />
          </Row>
        </>
      )}
    </>
  )
}

export function DownloadsSection() {
  const { t } = useTranslation()
  const bridge = useBridge()
  const toast = useToast()
  const outputDir = useSettings((s) => s.settings.outputDir)
  const concurrency = useSettings((s) => s.settings.concurrency)
  const update = useSettings((s) => s.update)

  const chooseFolder = async () => {
    try {
      const dir = await bridge.os.pickFolder()
      if (dir) update({ outputDir: dir })
    } catch (error) {
      toast.show(
        t('settings.failed', { reason: error instanceof Error ? error.message : String(error) }),
      )
    }
  }

  return (
    <Section id="downloads" title={t('settings.sections.downloads')}>
      <Row label={t('settings.downloads.folder.label')}>
        <span className={styles.path} title={outputDir}>
          {outputDir}
        </span>
        <PillButton variant="ghost" icon="folder-open" onClick={() => void chooseFolder()}>
          {t('settings.downloads.folder.choose')}
        </PillButton>
      </Row>
      <NameTemplate />
      <SelectRow
        label={t('settings.downloads.concurrency')}
        value={String(concurrency)}
        options={CONCURRENCY.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(value) => update({ concurrency: Number(value) })}
      />
      <Defaults />
    </Section>
  )
}
