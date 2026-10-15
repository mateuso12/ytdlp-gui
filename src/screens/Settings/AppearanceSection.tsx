import { useTranslation } from 'react-i18next'
import { Segmented } from '../../components/Segmented'
import type { Settings, ThemePref } from '../../core/types'
import { useSettings } from '../../stores/settings'
import { Row, Section } from './parts'

export function AppearanceSection() {
  const { t } = useTranslation()
  const theme = useSettings((s) => s.settings.theme)
  const language = useSettings((s) => s.settings.language)
  const update = useSettings((s) => s.update)

  return (
    <Section id="appearance" title={t('settings.sections.appearance')}>
      <Row label={t('settings.appearance.theme')}>
        {/* The settings store applies the theme as soon as it changes (startSettingsEffects). */}
        <Segmented<ThemePref>
          label={t('settings.appearance.theme')}
          value={theme}
          options={[
            { value: 'system', label: t('settings.appearance.system') },
            { value: 'light', label: t('settings.appearance.light') },
            { value: 'dark', label: t('settings.appearance.dark') },
          ]}
          onChange={(value) => update({ theme: value })}
        />
      </Row>
      <Row label={t('settings.appearance.language')}>
        <Segmented<Settings['language']>
          label={t('settings.appearance.language')}
          value={language}
          options={[
            { value: 'pt-BR', label: 'Português (Brasil)' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(value) => update({ language: value })}
        />
      </Row>
    </Section>
  )
}
