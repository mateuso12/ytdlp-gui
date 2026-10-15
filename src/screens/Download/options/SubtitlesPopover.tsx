import { useTranslation } from 'react-i18next'
import { languageName } from '../../../core/languages'
import { Segmented } from '../../../components/Segmented'
import { Switch } from '../../../components/Switch'
import type { VideoInfo } from '../../../core/types'
import { CheckRow, PopoverHeading, PopoverRow } from './OptionRow'
import styles from './options.module.css'

export interface SubtitlesState {
  langs: string[]
  embed: boolean
  includeAuto: boolean
}

export const NO_SUBTITLES: SubtitlesState = { langs: [], embed: true, includeAuto: false }

/** Languages shown in the row summary before the rest is folded into "+N". */
const SUMMARY_LANGS = 2

interface SubtitlesRowProps {
  video?: VideoInfo
  value: SubtitlesState
  onChange(next: SubtitlesState): void
}

/** "Legendas": which languages, embedded or as separate files, and whether automatic ones count. */
export function SubtitlesRow({ video, value, onChange }: SubtitlesRowProps) {
  const { t, i18n } = useTranslation()
  const manual = video?.subtitles ?? []
  const auto = video?.autoSubtitles ?? []
  const autoOnly = auto.filter((lang) => !manual.includes(lang))
  const name = (code: string) => languageName(code, i18n.language)

  const toggle = (lang: string, on: boolean) =>
    onChange({
      ...value,
      langs: on ? [...value.langs, lang] : value.langs.filter((l) => l !== lang),
    })

  // Turning the automatic ones off also drops the languages only they offered.
  const setAuto = (includeAuto: boolean) =>
    onChange({
      ...value,
      includeAuto,
      langs: includeAuto ? value.langs : value.langs.filter((l) => !autoOnly.includes(l)),
    })

  const names = value.langs.map(name)
  const summary =
    names.length === 0
      ? t('panel.subtitles.none')
      : names.length > SUMMARY_LANGS
        ? `${names.slice(0, SUMMARY_LANGS).join(', ')} ${t('panel.subtitles.more', { n: names.length - SUMMARY_LANGS })}`
        : names.join(', ')

  const nothing = manual.length === 0 && auto.length === 0

  return (
    <PopoverRow icon="captions" label={t('panel.subtitles.label')} summary={summary}>
      {nothing ? (
        <p className={styles.note}>{t('panel.subtitles.empty')}</p>
      ) : (
        <>
          {manual.length === 0 ? (
            <p className={styles.note}>{t('panel.subtitles.onlyAuto')}</p>
          ) : null}
          {manual.length > 0 ? (
            <>
              <PopoverHeading>{t('panel.subtitles.languages')}</PopoverHeading>
              <div className={styles.list}>
                {manual.map((lang) => (
                  <CheckRow
                    key={lang}
                    checked={value.langs.includes(lang)}
                    onChange={(on) => toggle(lang, on)}
                  >
                    {name(lang)}
                  </CheckRow>
                ))}
              </div>
            </>
          ) : null}
          {auto.length > 0 ? (
            <div className={styles.group}>
              <Switch
                fill
                label={t('panel.subtitles.auto')}
                checked={value.includeAuto}
                onCheckedChange={setAuto}
              />
              {value.includeAuto && autoOnly.length > 0 ? (
                <>
                  <PopoverHeading>{t('panel.subtitles.autoGroup')}</PopoverHeading>
                  <div className={styles.list}>
                    {autoOnly.map((lang) => (
                      <CheckRow
                        key={lang}
                        checked={value.langs.includes(lang)}
                        onChange={(on) => toggle(lang, on)}
                      >
                        {name(lang)}
                      </CheckRow>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <div className={styles.group}>
            <PopoverHeading>{t('panel.subtitles.how')}</PopoverHeading>
            <Segmented
              label={t('panel.subtitles.how')}
              value={value.embed ? 'embed' : 'separate'}
              onChange={(next) => onChange({ ...value, embed: next === 'embed' })}
              options={[
                { value: 'embed', label: t('panel.subtitles.embed') },
                { value: 'separate', label: t('panel.subtitles.separate') },
              ]}
            />
          </div>
        </>
      )}
    </PopoverRow>
  )
}
